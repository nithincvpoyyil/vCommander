'use strict';

var vCommander;
(function (vCommander) {

    var vCommand = (function () {
        var GenerateVCommand = function () {
            return {
                commandId: "default",
                commands: [],
                action: function () {},
                replay: String,
                success: function () {},
                error: function () {}
            };
        };
        return GenerateVCommand;
    })();

    var vCommanderConfig = (function () {
        var config = {
            delay: 100,
            commandSeries: {},
            options: {
                continuous: true
            }
        };
        return config;

    })();

    var vCommanderEngine = (function () {

        function vCommanderEngine(config) {
            var self = this;
            self.util = new vCommander.vCommanderUtil();
            self.forceAbort = false;
            self.isCommandExecuting = false;
            self.commandCollection = {};
            self.commandCollection.array = [];
            self.commandCollection.keys = [];
            self.config = this.util.extendObject(vCommander.vCommanderConfig, config);
            self.config.commandSeries = {};
            config.commandSeries.forEach(function (vCommand) {
                if (vCommand.commands && vCommand.commands.length) {
                    vCommand.commands.forEach(function (cmd) {
                        cmd = cmd.toString();
                        self.commandCollection.array[cmd] = vCommand.commandId;
                        self.commandCollection.keys.push(cmd);
                    });
                }
                self.config.commandSeries[vCommand.commandId] = vCommand;
            });

            self.init();
        }

        vCommanderEngine.prototype.init = function () {
            var self = this;
            if (!self.util.isChrome()) {
                throw new Error(10001, "Not chrome browser");
            } else if (!self.util.isSupportWebSpeechApi()) {
                throw new Error(10002, "No Speeech Api available");
            } else if (!self.util.isSupportWebVoiceDetectionApi()) {
                throw new Error(10003, " No voice detetction API present");
            } else {
                this.startup();
            }
        };

        vCommanderEngine.prototype.resetAll = function () {
            this.recognition = null;
            this.createVCEngine();
        };

        vCommanderEngine.prototype.logger = function (messege) {
            console.info("@log: ", messege);
        };

        vCommanderEngine.prototype.createVCEngine = function (engineConfig) {
            if (!Date.now) {
                Date.now = function now() {
                    return new Date().getTime();
                };
            }
            var self = this;
            if (self.recognition && self.recognition.abort) {
                self.recognition.abort();
            } else if (self.recognition && self.recognition.stop) {
                self.recognition.stop();
            }

            self.listeningStartTime = Date.now();
            self.recognition = new webkitSpeechRecognition();
            self.isListening = false;
            self.recognition.continuous = true;
            self.recognition.interimResults = true;
            self.recognition.lang = "en-IN";
            // bind events
            self.recognition.onresult = function (event) {
                self.listening.call(self, event);
            };
            self.recognition.onstart = function (event) {
                self.onStart.call(self, event);
            };
            self.recognition.onerror = function (event) {
                self.onError.call(self, event);
            };
            self.recognition.onend = function (event) {
                self.onEnd.call(self, event);
            };
        };

        vCommanderEngine.prototype.startListen = function () {
            this.createVCEngine();
            if (this.recognition && this.recognition.start) {
                this.forceAbort = false;
                this.recognition.start();
            }
        };

        vCommanderEngine.prototype.stopListen = function () {
            if (this.recognition && this.recognition.abort) {
                this.forceAbort = true;
                this.recognition.abort();
            }
        };

        vCommanderEngine.prototype.processTranscript = function (transcript, isFinal) {
            var self = this;
            var vCommand = null;
            var commandId = null;
            var keys = self.commandCollection.keys;
            var usePrediction = true;
            var i = 0;
            var lDistance = 0;
            var numberOfKeys = (keys.length) ? keys.length : 0;
            var timeoutId = null;
            self.logger("raw transcript >> " + transcript);

            if (keys.lastIndexOf(transcript) !== -1) {
                commandId = self.commandCollection.array[transcript];
                vCommand = self.config.commandSeries[commandId];
                if (!self.isCommandExecuting) {
                    self.isCommandExecuting = true;
                    console.log(vCommand, "inter");
                    timeoutId = setTimeout(function () {
                        self.isCommandExecuting = false;
                        clearTimeout(timeoutId);
                    }, 100);
                }

            } else if (transcript && usePrediction && isFinal) {
                for (i = 0; i < numberOfKeys; i++) {
                    if (self.util.levenshteinDistance(transcript, keys[i]) > 0.8) {
                        commandId = self.commandCollection.array[transcript];
                        vCommand = self.config.commandSeries[commandId];
                        if (!self.isCommandExecuting) {
                            self.isCommandExecuting = true;
                            console.log(vCommand, "final");
                            timeoutId = setTimeout(function () {
                                self.isCommandExecuting = false;
                                clearTimeout(timeoutId);
                            }, 500);
                        }


                    }
                }
            }

        };
        vCommanderEngine.prototype.listening = function (event) {

            var self = this;
            var interimediate_transcript = "";
            var final_transcript = "";
            var isFinal = false;

            for (var i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    isFinal = true;
                    final_transcript += event.results[i][0].transcript;
                } else {
                    isFinal = false;
                    interimediate_transcript += event.results[i][0].transcript;
                }
            }

            if (isFinal && final_transcript) {
                self.processTranscript(final_transcript, true);
            } else if (interimediate_transcript) {
                self.processTranscript(interimediate_transcript, false);
            }
        };

        vCommanderEngine.prototype.onError = function (event) {
            var self = this;
            switch (event.error) {
            case "network":
            case "not-allowed":
            case "service-not-allowed":
                this.logger("error happend due to " + event.error);
                break;
            default:
                this.logger("error happend due to " + event.error);
            }

            var timeout = setTimeout(function () {
                self.resetAll();
                clearTimeout(timeout);
            }, 1000);
        };

        vCommanderEngine.prototype.onStart = function () {
            var self = this;
            self.isListening = true;
            self.listeningStartTime = Date.now();
            self.logger("listening -- Start");
        };

        vCommanderEngine.prototype.onEnd = function () {

            var self = this;
            self.logger("listening -- end");
            self.isListening = false;
            var currentTime = Date.now();
            var timeDiffernce = Date.now() - self.listeningStartTime;

            if (timeDiffernce > 1500) {
                if (!self.forceAbort) {
                    self.listeningStartTime = Date.now();
                    self.recognition.start();
                    self.logger("listening -- end-->restart -- time difference--" + timeDiffernce);
                }

            } else {
                var timeout = setTimeout(function () {
                    if (!self.forceAbort) {
                        self.listeningStartTime = Date.now();
                        self.recognition.start();
                        self.logger("listening -- end-->restart --- timeout");
                    }
                    clearTimeout(timeout);
                }, 1400);
            }
        };

        vCommanderEngine.prototype.startup = function () {
            this.logger("startup");
            this.startListen();
        };
        vCommanderEngine.prototype.onSuccess = function () {};
        vCommanderEngine.prototype.onFail = function () {};
        vCommanderEngine.prototype.addCommands = function () {};
        vCommanderEngine.prototype.removeCommands = function () {};

        return vCommanderEngine;
    })();

    var vCommanderUtil = (function () {
        function vCommanderUtil() {}
        vCommanderUtil.prototype.isChrome = function () {
            return /chrom(e|ium)/.test(navigator.userAgent.toLowerCase());
        };
        vCommanderUtil.prototype.isSupportWebSpeechApi = function () {
            return (!("webkitSpeechRecognition" in window)) ? false : true;
        };
        vCommanderUtil.prototype.isSupportWebVoiceDetectionApi = function () {
            return (("speechSynthesis" in window) && ("SpeechSynthesisEvent" in window) &&
                ("SpeechSynthesisUtterance" in window)) ? true : false;
        };
        vCommanderUtil.prototype.extendObject = function (object1, object2) {
            for (var key in object2) {
                object1[key] = object2[key];
            }
            return object1;
        };

        // https://en.wikibooks.org/wiki/Algorithm_Implementation/Strings/Levenshtein_distance#JavaScript
        vCommanderUtil.prototype.levenshteinBaseAlgorithm = function (a, b) {

            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;

            var matrix = [];

            // increment along the first column of each row
            var i;
            for (i = 0; i <= b.length; i++) {
                matrix[i] = [i];
            }

            // increment each column in the first row
            var j;
            for (j = 0; j <= a.length; j++) {
                matrix[0][j] = j;
            }

            // Fill in the rest of the matrix
            for (i = 1; i <= b.length; i++) {
                for (j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) == a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                            Math.min(matrix[i][j - 1] + 1, // insertion
                                matrix[i - 1][j] + 1)); // deletion
                    }
                }
            }

            return matrix[b.length][a.length];
        };

        // Return an edit distance from 0 to 1
        vCommanderUtil.prototype.levenshteinDistance = function (string1, string2) {
            if (string1 === null && string2 === null) return 0;
            if (string1 === null || string2 === null) return 0;
            string1 = String(string1);
            string2 = String(string2);

            var distance = this.levenshteinBaseAlgorithm(string1, string2);
            if (string1.length > string2.length) {
                return 1 - distance / string1.length;
            } else {
                return 1 - distance / string2.length;
            }
        };


        return vCommanderUtil;
    })();

    vCommander.vCommanderUtil = vCommanderUtil;
    vCommander.vCommanderEngine = vCommanderEngine;
    vCommander.vCommanderConfig = vCommanderConfig;
    vCommander.vCommand = vCommand;
})(vCommander || (vCommander = {}));


//--------------------------------------------------------------------------------------------//

var getVcommands = function () {

    var a = new vCommander.vCommand();
    var b = new vCommander.vCommand();
    var c = new vCommander.vCommand();
    var d = new vCommander.vCommand();

    a.commandId = "start";
    a.commands = ["start", "art", "smart", "cart", "sat"];
    a.action = function () {
        console.log("start ok")
    };
    a.replay = "start ok";
    a.success = function () {
        console.log("success");
    };
    a.error = function (e) {
        console.log("Error" + e);
    };

    b.commandId = "left";
    b.action = function () {
        console.log("left ok")
    };
    b.replay = "";
    b.success = function () {};
    b.error = function () {};

    c.commandId = "right";
    c.action = function () {
        console.log("right ok")
    };
    c.commands = ["right", "rite", "write", "white", "vine"];
    c.replay = "";
    c.success = function () {};
    c.error = function () {};

    d.commandId = "down";
    d.action = function () {
        console.log("down ok")
    };
    d.replay = "";
    d.success = function () {};
    d.error = function () {};

    console.log([a, b, c, d], "Go and get it, things will never comes for you, if it comes to you it may be too late to get it");

    return [a, b, c, d];
};
window.vcEngine = new vCommander.vCommanderEngine({
    commandSeries: getVcommands(),
    delay: 100
});