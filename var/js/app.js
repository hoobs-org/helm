class Shell {
    constructor(selector) {
        this.element = document.querySelector(selector);
        this.authenticated = false;

        this.style("/css/xterm.css");
        this.style("/css/xterm-extra.css");

        const waits = [];

        waits.push(this.load("/js/socket.io.min.js"));
        waits.push(this.load("/js/xterm.js"));
        waits.push(this.load("/js/xterm-addon-fit.js"));
        waits.push(this.load("/js/xterm-addon-web-links.js"));

        this.credentials = {
            username: "",
            password: "",
        };

        Promise.all(waits).then(() => {
            this.events = {};
            this.socket = io("/");
            this.create();
        });
    }

    style(path) {
        const link  = document.createElement("LINK");

        link.rel  = "stylesheet";
        link.type = "text/css";
        link.href = path;
        link.media = "all";

        document.head.appendChild(link);
    }

    load(path) {
        return new Promise((resolve) => {
            const script = document.createElement("SCRIPT");

            script.type = "text/javascript";
            script.src = path;

            script.onreadystatechange = resolve;
            script.onload = resolve;

            document.head.appendChild(script);
        });
    }

    create() {
        this.measure = document.createElement("DIV");
        this.measure.innerHTML = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        this.measure.style.position = "absolute";
        this.measure.style.top = "0";
        this.measure.style.left = "0";
        this.measure.style.visibility = "hidden";
        this.measure.style.fontFamily = "courier-new, courier, monospace";
        this.measure.style.fontSize = "15px";
        this.measure.style.height = "auto";
        this.measure.style.width = "auto";
        this.measure.style.whiteSpace = "nowrap";

        this.element.appendChild(this.measure);

        this.text = {
            width: Math.floor((this.measure.clientWidth + 1) / 52),
            height: Math.floor(this.measure.clientHeight + 1),
        };

        this.measure.remove();

        this.flow = document.createElement("DIV");
        this.flow.style.width = "100%";
        this.flow.style.height = "100%";

        this.element.appendChild(this.flow);

        this.container = document.createElement("DIV");
        this.container.style.display = "block";
        this.container.style.width = "100%";
        this.container.style.height = "100%";

        this.flow.appendChild(this.container);

        this.shell = document.createElement("DIV");
        this.shell.style.width = "100%";
        this.shell.style.height = "100%";

        this.container.appendChild(this.shell);

        this.term = new Terminal({
            cursorStyle: "bar",
            cursorBlink: true,
            fontSize: 15,
            theme: {
                background: "#141414",
                foreground: "#999",
                cursor: "#999",
            },
        });

        document.addEventListener("contextmenu", (event) => {
            event.preventDefault();

            if (this.term.hasSelection()) document.execCommand("copy");

            this.term.select(0, 0, 0);

            return false;
        });

        this.term.attachCustomKeyEventHandler((event) => (event.key === "v" && event.ctrlKey) ? false : true);
        this.screen = new FitAddon.FitAddon();

        this.term.loadAddon(this.screen);
        this.term.loadAddon(new WebLinksAddon.WebLinksAddon());

        this.listners();
        this.open();
    }

    open() {
        this.term.open(this.shell);
        this.resize();
        this.term.write(`${navigator.userAgent || navigator.vendor}\r\n`);
        this.term.write("\r\n");
        this.prompt();
        this.term.focus();
    }

    listners() {
        this.on("authenticated", (motd) => {
            this.resize();

            if (motd) {
                const lines = motd.split("\n");

                for (let i = 0; i < lines.length; i += 1) {
                    this.term.write(`${i > 0 ? "\r\n" : ""}${lines[i]}`);
                }
            }

            this.socket.on("shell_output", (data) => {
                if (data.toString().trim() === "exit") {
                    this.disconnect();
                } else {
                    this.term.write(data);
                }
            });

            this.authenticated = true;
        });

        this.on("unauthorized", () => {
            this.disconnect();
        });

        this.on("shell_exit", () => {
            this.disconnect();
        });

        window.addEventListener("resize", () => {
            this.resize();
        }, true);

        window.onunload = () => {
            this.disconnect();
        };

        this.term.onData((data) => {
            if (this.authenticated) {
                this.socket.emit("shell_input", data);
            } else {
                switch (data) {
                    case "\r":
                    case "\u0003":
                        this.prompt();
                        break;

                    case "\u007F":
                        switch (this.field) {
                            case "username":
                                if (this.term._core.buffer.x > 7) {
                                    this.term.write("\b");
                                    this.term.write(" ");
                                    this.term.write("\b");
                                    this.credentials.username = this.credentials.username.slice(0, -1);
                                }

                                break;

                            case "password":
                                if (this.term._core.buffer.x > 10) {
                                    this.term.write("\b");
                                    this.term.write(" ");
                                    this.term.write("\b");
                                    this.credentials.password = this.credentials.password.slice(0, -1);
                                }

                                break;
                        }

                        break;

                    default:
                        switch (this.field) {
                            case "username":
                                this.term.write(data);
                                this.credentials.username += data;
                                break;

                            case "password":
                                this.term.write("*");
                                this.credentials.password += data;
                                break;
                        }

                        break;
                }
            }
        });
    }

    off(event) {
        this.socket.off(event, this.events[event]);

        delete this.events[event];
    }

    on(event, callback) {
        this.off(event);

        this.events[event] = callback;

        this.socket.on(event, this.events[event]);
    }

    emit(event, data) {
        if (event === "shell_connect") this.emit("shell_disconnect");
        if (event === "shell_disconnect") this.off("shell_output");

        this.socket.emit(event, data);
    }

    prompt() {
        switch (this.field) {
            case "username":
                this.term.write("\r\nPassword: ");
                this.field = "password";
                break;

            case "password":
                this.term.write("\x1B[2K");
                this.term.write("\x1B[A");
                this.term.write("\x1B[2K");
                this.term.write("\x1B[A");
                this.term.write("\x1B[2K");
                this.term.write("\x1B[A");
                this.term.write("\x1B[2K");
                this.term.write("\r");
                this.field = undefined;
                this.socket.emit("shell_connect", this.credentials);
                this.credentials.username = "";
                this.credentials.password = "";
                break;

            default:
                this.credentials.username = "";
                this.credentials.password = "";
                this.term.write("\r\Login: ");
                this.field = "username";
                break;
        }
    }

    disconnect() {
        this.authenticated = false;

        this.socket.off("shell_output");
        this.socket.emit("shell_disconnect");

        window.location.reload();
    };

    resize() {
        this.container.style.display = "none";

        setTimeout(() => {
            const cols = Math.floor((this.flow.clientWidth + 1) / this.text.width);
            const rows = Math.floor((this.flow.clientHeight + 1) / this.text.height);

            this.container.style.display = "block";
            this.screen.fit();

            this.term.resize(cols, rows);
            this.socket.emit("shell_resize", `${cols}:${rows}`);
            this.term.focus();
        }, 10);
    }
}
