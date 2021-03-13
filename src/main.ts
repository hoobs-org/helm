/**************************************************************************************************
 * helm                                                                                        *
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

import "source-map-support/register";

import Program from "commander";
import { execSync } from "child_process";
import State from "./state";
import Shell from "./shell";

export = function Daemon(): void {
    Program.version(State.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.option("-m, --mode <mode>", "set the enviornment", (mode: string) => { State.mode = mode; })
        .option("-d, --debug", "turn on debug level logging", () => { State.debug = true; });

    Program.command("shell", { isDefault: true })
        .description("start the helm service")
        .option("-p, --port <port>", "change the port the hub runs on")
        .action((command) => {
            const shell = new Shell(command.port);

            shell.start();
        });

    Program.command("service <action>")
        .description("manage server bridges")
        .action((action) => {
            switch (action) {
                case "start":
                    execSync("systemctl start helm.service");
                    console.log("helm started");
                    break;

                case "stop":
                    execSync("systemctl stop helm.service");
                    console.log("helm stoped");
                    break;

                case "restart":
                    execSync("systemctl restart helm.service");
                    console.log("helm restarted");
                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }
        });

    Program.parse(process.argv);
};
