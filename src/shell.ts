/**************************************************************************************************
 * hoobsd                                                                                         *
 * Copyright (C) 2020 HOOBS                                                                       *
 *                                                                                                *
 * This program is free software: you can redistribute it and/or modify                           *
 * it under the terms of the GNU General Public License as published by                           *
 * the Free Software Foundation, either version 3 of the License, or                              *
 * (at your option) any later version.                                                            *
 *                                                                                                *
 * This program is distributed in the hope that it will be useful,                                *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of                                 *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the                                  *
 * GNU General Public License for more details.                                                   *
 *                                                                                                *
 * You should have received a copy of the GNU General Public License                              *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.                          *
 **************************************************************************************************/

import HTTP from "http";
import Server from "express";
import Compression from "compression";
import IO from "socket.io";
import CORS from "cors";
import Pam from "@hoobs/pam";
import { join } from "path";
import { Express } from "express-serve-static-core";
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs-extra";
import { createHttpTerminator, HttpTerminator } from "http-terminator";
import { spawn, IPty } from "node-pty";

const profiles = [
    "/etc/profile",
    "/home/{{USER}}/.bash_profile",
    "/home/{{USER}}/.bash_login",
    "/home/{{USER}}/.profile",
    "/home/{{USER}}/.bashrc",
];

export default class Shell {
    declare time: number;

    declare hide: boolean;

    declare running: boolean;

    declare readonly port: number;

    declare private shells: IPty[];

    declare private server: HTTP.Server;

    declare private listner: HttpTerminator;

    declare readonly app: Express;

    declare readonly io: IO.Server;

    declare private enviornment: { [key: string]: string };

    constructor(port: number | undefined) {
        this.port = port || 9090;
        this.app = Server();
        this.app.use(Compression());
        this.running = false;
        this.shells = [];
        this.hide = false;

        this.app.use(CORS({
            origin: "*",
            credentials: false,
        }));

        this.server = HTTP.createServer(this.app);
        this.listner = createHttpTerminator({ server: this.server });

        this.io = new IO.Server(this.server, {
            cors: {
                origin: "*",
                credentials: false,
            },
        });

        this.io?.on("connection", (socket: IO.Socket): void => {
            socket.on("shell_connect", (credentials: any) => {
                Pam.authenticate(credentials.username, credentials.password, (status: any) => {
                    if (status) {
                        socket.emit("unauthorized");
                    } else {
                        const uid = parseInt(execSync(`id -u ${credentials.username}`).toString().trim(), 10);
                        const gid = parseInt(execSync(`id -u ${credentials.username}`).toString().trim(), 10);

                        let expired = false;

                        try {
                            expired = execSync(`chage -l ${credentials.username} | grep 'Password expires' | grep 'password must be changed'`).toString().trim() !== "";
                        } catch (_error) {
                            expired = false;
                        }

                        if (Number.isNaN(uid) || Number.isNaN(gid)) {
                            socket.emit("unauthorized");

                            return;
                        }

                        if (expired && Shell.validate(credentials.password, credentials.newPassword, credentials.confirmPassword)) {
                            socket.emit("reset_fields");

                            try {
                                execSync(`echo "${credentials.username}:${credentials.newPassword}" | chpasswd`);
                                execSync(`passwd -x -1 ${credentials.username}`);

                                socket.emit("unauthorized");
                            } catch (_error) {
                                socket.emit("unauthorized");
                            }
                        } else if (expired) {
                            socket.emit("change_password");
                        } else {
                            socket.emit("reset_fields");

                            const { env } = process;

                            env.SHELL = existsSync("/bin/bash") ? "/bin/bash" : process.env.SHELL || "sh";
                            env.MAIL = `/var/mail/${credentials.username}`;
                            env.USER = credentials.username;
                            env.HOME = `/home/${credentials.username}`;
                            env.PWD = env.HOME;
                            env.LOGNAME = credentials.username;

                            const keys = Object.keys(env);

                            for (let i = 0; i < keys.length; i += 1) {
                                if (keys[i].toLowerCase().indexOf("sudo") >= 0) delete env[keys[i]];
                            }

                            const shell = spawn(env.SHELL, [], {
                                name: "xterm-color",
                                cwd: existsSync(`/home/${credentials.username}`) ? `/home/${credentials.username}` : "/",
                                env: <{ [key: string]: string }>env,
                                uid,
                                gid,
                            });

                            this.hide = true;

                            const groups = this.groups(credentials.username);

                            for (let i = 0; i < groups.length; i += 1) {
                                shell.write(`newgrp ${groups[i]}\r`);
                            }

                            shell.write(`newgrp ${credentials.username}\r`);
                            shell.write("clear\r");

                            for (let i = 0; i < profiles.length; i += 1) {
                                if (existsSync(profiles[i].replace(/{{USER}}/g, credentials.username))) shell.write(`${profiles[i].replace(/{{USER}}/g, credentials.username)}\r`);
                            }

                            let motd: string | undefined;

                            const updates: string[] = existsSync("/etc/update-motd.d") ? readdirSync("/etc/update-motd.d") : [];

                            for (let i = 0; i < updates.length; i += 1) {
                                if (motd) {
                                    motd += execSync(join("/etc/update-motd.d", updates[i])).toString();
                                } else {
                                    motd = execSync(join("/etc/update-motd.d", updates[i])).toString();
                                }
                            }

                            if (existsSync("/etc/motd")) motd += Shell.getty(readFileSync("/etc/motd").toString());

                            socket.emit("authenticated", motd);

                            setTimeout(() => {
                                this.hide = false;

                                shell.write("\r");
                            }, 1000);

                            shell.onData((data: any) => {
                                if (!this.hide) socket.emit("shell_output", data);
                            });

                            shell.onExit(() => {
                                socket.emit("shell_exit");
                            });

                            socket.on("shell_input", (data: any): void => {
                                shell.write(`${data}`);
                            });

                            socket.on("shell_resize", (data: any): void => {
                                const parts = `${data}`.split(":");

                                if (parts.length === 2 && !Number.isNaN(parseInt(parts[0], 10)) && !Number.isNaN(parseInt(parts[1], 10))) {
                                    shell.resize(
                                        parseInt(parts[0], 10),
                                        parseInt(parts[1], 10),
                                    );
                                }
                            });

                            socket.on("shell_clear", (): void => {
                                shell.write("clear\r");
                            });

                            socket.on("shell_disconnect", (): void => {
                                shell.write("exit\r");
                                shell.kill();
                            });

                            this.shells.push(shell);
                        }
                    }
                });
            });
        });

        this.app.use("/", Server.static(join(__dirname, "static")));
        this.app.use("/issue", (_request, response) => response.send(Shell.issue()));
    }

    groups(username: string): string[] {
        return ((execSync(`groups ${username}`).toString().trim().split(":") || []).pop() || "").trim().split(" ").filter((item) => item !== username);
    }

    static issue(): string {
        if (existsSync("/etc/issue")) {
            return Shell.getty(readFileSync("/etc/issue").toString());
        }

        return "";
    }

    static getty(value: string): string {
        let content = value;

        content = content.replace(/\\b|\\s|\\o|\\r|\\u|\\v/gm, "");
        content = content.replace(/\\l/gm, "helm");
        content = content.replace(/\\m/gm, Shell.architecture());
        content = content.replace(/\\n/gm, Shell.hostname());
        content = content.replace(/\\d/gm, "{{DATE}}");
        content = content.replace(/\\t/gm, "{{TIME}}");

        return content;
    }

    static hostname() {
        try {
            return execSync("hostname").toString().trim();
        } catch (_error) {
            return "";
        }
    }

    static architecture() {
        try {
            return execSync("uname -m").toString().trim();
        } catch (_error) {
            return "";
        }
    }

    static validate(password: string, updated: string, confirm: string): boolean {
        if (!updated || updated === "") return false;
        if (!confirm || confirm === "") return false;
        if (updated !== confirm) return false;
        if (updated === password) return false;

        return true;
    }

    async stop(): Promise<void> {
        if (this.running) {
            this.running = false;

            for (let i = 0; i < this.shells.length; i += 1) {
                try {
                    this.shells[i].kill();
                } catch (_error) { /* NULL */ }
            }

            this.listner.terminate();
        }
    }

    start() {
        this.server?.listen(this.port, () => {
            this.running = true;
            this.time = new Date().getTime();

            console.log(`listning on ${this.port}`);
        });
    }
}
