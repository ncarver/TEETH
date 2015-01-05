/** 
Copyright (c) 2014, Nathan Carver
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted 
provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions
   and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions
   and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse
   or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE 
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT 
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS 
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR 
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF 
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

/**
 * @file Code to run the TEETH Smart Toothbrush Holder on Intel Edison board.
 * 
 * Code is maintained at https://github.com/ncarver/TEETH-IotToothbrushHolder.
 * 
 * All code and modules are defined in this file, main.js.
 * 
 * @author Nathan Carver
 * @copyright Nathan Carver 2014
 * @version 0.0.1
*/


/*
 * Required libraries 
 * 
 * You will need these libraries to interface with the services and hardware.
 */
var MRAA = require('mraa');         //require MRAA for communicating with hardware pins
var LCD = require('jsupm_i2clcd');  //require LCD libraries for signaling the LCD screen
var LED = require('jsupm_grove');   //require SEEED Grove library for photoresister
var BUZZ = require("jsupm_buzzer"); //require SEEED Grove library for buzzer
var MAILER = require('nodemailer'); //require for sending emails over SMTP
var NET = require('net');           //require for sending cloud data to Edison service on TCP



/** 
 * Change the constants properties to customize the operation of the TEETH Smart Toothbrush Timer
 * @global
 */
var constants = {
    'LOG_LEVEL': 3, //Change this value to limit loggin output: 0-none, 1-err, 2-warn, 3-info, 4-debug, 5-all
    'USE_SOUND': true,
    'PINS': {       //Change these values to match the pins on your Edison build
        'brushSwitch': [8, 4],    //digital pins monitoring switches for toothbrushes
        'buzzer': 3,              //digital pin for signaling the buzzer
        'roomLightSensor': 0,     //analog pin for getting room light readings from photoresister on 10K external pullup
        'roomLightThreshold' : 80 //value that indicates that room is dark
    },
    'MAIL': {       //Change these values based on documentation at nodemailer to use your SMTP account
        'service': 'Gmail',                                    //Account service name, ex. "Gmail"
        'user': 'your.name@gmail.com',                         //user name to login to your service
        'pass': 'pass****',                                    //password to login to your service
        'from': 'TEETH <teeth@server.com>',                    //appears in the "From:" section of your emails
        'brushTo': ['brush.1@gmail.com', 'brush.2@gmail.com'], //email value for each toothbrush
        'subject': 'Great job on TEETH!',                      //appears as the subject of your emails
        'body': 'You met the goal today. Way to go!'           //the body text of your emails
    },
    'METRICS': {    //Change these values to match the custom components of your Intel Cloud Analytics
        'brushComponent': ['brush1', 'brush2'] //component value for each toothbrush
    },
    'SCREEN_MSG': { //Messages that appear on the LCD screen during the timer prep and countdown
        'ready': '...get ready',            //message to display during start of prep time
        'set':   '.....get set',            //message to display last five seconds of prep time
        'countdown': 'Countdown:',          //message to display during countdown
        'percent25': '...almost there!',    //message to display 25% of the way through countdown
        'percent50': 'good...halfway  ',    //message to display 50% of the way through countdown
        'percent75': 'you\'re doing it ',   //message to display 75% of the way through countdown
        'finish': 'GREAT JOB!',             //message to display at the end of countdown
        'brushName': ['Nathan', 'Sarah']    //name to display during countdwon, one value for each toothbrush
    },
    'TIME': {       //Time focused constants for timer, buzzer sounds
        'brushPreptime': [10, 30],       //seconds of prep time for each toothbrush
        'brushGoaltime': [30, 120],      //seconds of countdown time for each toothbrush
        'buzzDuration': 20,              //milliseconds of buzzer time for start and stop sounds
        'buzzInterval': 150              //milliseconds between buzzer sounds for start and stop signals
    },
    'COLOR': {      //Colors to use on the LCD screen
        'off':       [  0,   0,   0], //black      - use when LCD is off
        'ready':     [100, 100, 100], //light grey - use during prep time
        'percent0':  [255,  68,  29], //red        - use at start of countdown
        'percent25': [232, 114,  12], //brown      - use when countdown is 25% finished
        'percent50': [255, 179,   0], //orange     - use when countdown is 50% finished
        'percent75': [232, 211,  12], //yellow     - use when countdown is 75% finished
        'finish':    [ 89, 132,  13], //green      - use when countdown is finished
        'colorFadeDuration': 1000,    //milliseconds to fade to new color during countdown mode
        'fadeSteps': 100              //number of fading steps to take during colorFadeDuration
    }
};

/**
 * These values hold the setTimeout and setInterval handles so they can be cleared as part of a timer interuption
 * @global
 */
var timers = {
    'fadeColor': null,        //timer fading the color on the LCD screen
    'buzzerPlay': null,       //timer playing the buzzer sounds
    'buzzerWait': null,       //timer waiting in between buzzer sounds
    'prepCountdown': null,    //timer for the main prep time
    'startCountdown': null,   //timer for the last five seconds of prep time
    'countdown': null,        //timer for the main countdown
    'lightsOut': null         //timer lookin for "lights out" interuption
};

/**
 * Creates a new Logger object and the helper methods used to send messages to console.
 * Highest level of logging, ERR (1), only outputs errors during code execution.
 * Lowest level DEBUG (4) outputs all logging messages.
 * 
 * @see constants.LOG_LEVEL Use the constant constants.LOG_LEVEL to adjust the level of output.
 * @class
 */
var Logger = function () {
    this.ERR = 1;
    this.WARN = 2;
    this.INFO = 3;
    this.DEBUG = 4;

    /**
     * @private
     */
    var logLevels = ['', 'err', 'warn', 'info', 'debug'];

    /** 
     * @param {string} msg message to send to logger
     * @param {int} level log level for this message
     * @public
     */
    this.it = function (msg, level) {
        if (constants.LOG_LEVEL >= level || level === undefined) {
            console.log('%s - %s: %s', new Date(), logLevels[level], msg);
        }
    };

    /*
     * @param {string} msg message to send to logger at log level ERR (1)
     * @public 
     */
    this.err = function (msg) {
        this.it(msg, this.ERR);
    };

    /*
     * @param {string} msg message to send to logger at log level WARN (2)
     * @public 
     */
    this.warn = function (msg) {
        this.it(msg, this.WARN);
    };

    /*
     * @param {string} msg message to send to logger at log level INFO (3)
     * @public 
     */
    this.info = function (msg) {
        this.it(msg, this.INFO);
    };

    /*
     * @param {string} msg message to send to logger at log level DEBUG (4)
     * @public 
     */
    this.debug = function (msg) {
        this.it(msg, this.DEBUG);
    };
};

/**
 * Creates a new Sensors object to monitor the hardware connected to the Edison
 * @requires mraa:Gpio
 * @requires mraa:Aio
 * @param {Logger} log object for logging output
 * @see constants.PINS Use the constant constants.PINS to identify the hardware connections
 * @class
 */
var Sensors = function (log) {
    log.info('instatiate Sensors');

    /** 
     * @private
     */
    var i;

    /**
     * the array of switches associated with each toothbrush are initialized
     *  as INPUT pins during instatiation.
     * @public
     */
    this.brushSwitch = [];
    for (i = 0; i < constants.PINS.brushSwitch.length; i = i + 1) {
        this.brushSwitch[i] = new MRAA.Gpio(constants.PINS.brushSwitch[i]);
        this.brushSwitch[i].dir(MRAA.DIR_IN);
    }

    /**
     * the analog pin for monitoring the phototransister is initialized
     *  during instatiation. Expected that this photo cell will have a 10K 
     *  external pulldown resistor.
     * @public
     */
//    this.roomLightSensor = new MRAA.Aio(constants.PINS.roomLightSensor);
};

/**
 * Creates a new Buzzer object to play a sound on the buzzer connected to the Edison
 * @requires jsupm_buzzer:Buzzer
 * @param {Logger} log object for logging output
 * @see constants.TIME Use the properties of constants.TIME to adjust the buzzer sounds
 * @class
 */
var Buzzer = function (log) {
    log.info('instatiate Buzzer');
    var buzzer = new BUZZ.Buzzer(constants.PINS.buzzer);

    /** 
     * play calls the playSound method of the low-level buzzer class for a simple tone value
     * @private 
     */
    function play(buzzingTime) {
        log.debug('(buzzer.play for ' + buzzingTime + ')');
        if (!constants.USE_SOUND) {
            return;
        }
        buzzer.playSound(BUZZ.DO, 5000);
        timers.buzzerPlay = setTimeout(function () {
            buzzer.playSound(BUZZ.DO, 0);
        }, buzzingTime);
    }

    /**
     * plays the standard sound for the buzz duration, then waits, and plays again
     * expected to be called at the beginning of the countdown
     * @public
     */
    this.playStartSound = function () {
        log.info('buzzer.playStartSound');
        play(constants.TIME.buzzDuration);
        timers.buzzerWait = setTimeout(function () {
            play(constants.TIME.buzzDuration);
        }, constants.TIME.buzzInterval);
    };

    /**
     * plays the standard sound for the buzz duration, then waits, and plays again
     * expected to be called at the end of the countdown
     * @public
     */
    this.playStopSound = function () {
        log.info('buzzer.playStopSound');
        play(constants.TIME.buzzDuration);
        timers.buzzerWait = setTimeout(function () {
            play(constants.TIME.buzzDuration);
        }, constants.TIME.buzzInterval);
    };
};

/**
 * Creates a new Screen object to display messages and colors RGB LCD connected to the Edison over I2C
 * @requires jsupm_i2clcd:Jhd1313m1
 * @param {Logger} log object for logging output
 * @see constants.COLOR Use the properties of constants.COLOR to adjust the screen background colors
 * @see constants.SCREEN_MSG Use the properties of constants.SCREEN_MSG to change the messages displayed on screen
 * @class
 */
var Screen = function (log) {
    log.info('instatiate Screen');

    /**
     * Instance variables to connect to LCD screen and manage the color fading
     * @private
     */
    var lcd = new LCD.Jhd1313m1(6, 0x3E, 0x62), //standard I2C bus
        interval = constants.COLOR.colorFadeDuration / constants.COLOR.fadeSteps,
        lastColor = constants.COLOR.off,
        steps = constants.COLOR.fadeSteps;

    /** 
     * getRemainingSteps identifies how many more steps are needed before fade is finished
     * @returns {int} number of steps remaining
     * @private
     */
    function getRemainingSteps() {
        log.debug('(screen.getRemainingSteps)');
        return steps;
    }

    /** 
     * setRemainingSteps sets how many more steps are needed before fade is finished
     * @params {int} remainingSteps new number of steps remaining
     * @private 
     */
    function setRemainingSteps(remainingSteps) {
        log.debug('(screen.setRemainingSteps: ' + remainingSteps + ')');
        steps = remainingSteps;
    }

    /** 
     * setScreen color calls low-level methods to set RGB values of screen background
     * also sets the instance variable "lastColor" to help with fade control
     * @param {array} colorArray array of decimal color values in Red Green Blue order [r,g,b]
     * @private 
     */
    function setScreenColor(colorArray) {
        log.debug('(screen.setScreenColor to ' + colorArray + ')');
        lcd.setColor(colorArray[0], colorArray[1], colorArray[2]);
        lastColor = colorArray;
    }

    /**
     * Inner method called by timeouts to fade background color from current color to the 
     * updated color passed RGB color array
     * @private
    */
    function _fadeColor(colorArray) {
        log.debug('(screen._fadeColor: ' + colorArray + ')');
        var step = getRemainingSteps();
        if (step > 0) {
            var diffRed = colorArray[0] - lastColor[0],
                diffGrn = colorArray[1] - lastColor[1],
                diffBlu = colorArray[2] - lastColor[2],

                stepRed = parseInt(diffRed / step, 10),
                stepGrn = parseInt(diffGrn / step, 10),
                stepBlu = parseInt(diffBlu / step, 10),

                nextRed = lastColor[0] + stepRed,
                nextGrn = lastColor[1] + stepGrn,
                nextBlu = lastColor[2] + stepBlu;

            setScreenColor([nextRed, nextGrn, nextBlu]);
            setRemainingSteps(step - 1);

            timers.fadeColor = setTimeout(function () {
                _fadeColor(colorArray);
            }, interval);
        }
    }

    /**
     * Starts a timout sequence to slowy change the LCD RGB screen background from its current
     *  color to the one passed in the parameters. The speed and number of steps used for fading
     *  are controlled by the constants.
     *
     * @param {array} colorArray a 3-member array of decimal numbers describing the color to display 
     *  on the screen background: [r,g,b]
     * @public
     */
    this.fadeColor = function (colorArray) {
        log.info('screen.fadeColor: ' + colorArray);
        setRemainingSteps(constants.COLOR.fadeSteps);
        _fadeColor(colorArray);
    };

    /**
     * Helper method combines clearing the screen of all text content and returning the cursor
     *  position back to the top left.
     * @public
     */
    this.reset = function () {
        log.info('screen.reset');
        lcd.clear();
        lcd.setCursor(0, 0);
    };

    /**
     * Helper method combines reseting the screen and returning the screen color to "off"
     * @public
     */
    this.resetAndTurnOff = function () {
        log.info('screen.resetAndTurnOff');
        this.reset();
        setScreenColor(constants.COLOR.off);
    };

    /**
     * Turns the screen on and displays the "ready" message defined in constants for the given toothbrush
     *
     * @param {int} componentIndex identifies the toothbrush by it's array index
     * @public
     */
    this.displayReady = function (componentIndex) {
        log.info('screen.displayReady for ' + componentIndex);

        lcd.clear();
        setScreenColor(constants.COLOR.ready);
        this.write(constants.SCREEN_MSG.brushName[componentIndex], 0, 0);
        this.write(constants.SCREEN_MSG.ready, 1, 0);
    };

    /**
     * Changes the "ready" message to the "set" message defined in constants for the given toothbrush
     * 
     * @param {int} componentIndex identifies the toothbrush by it's array index
     * @public
     */
    this.displaySet = function (componentIndex) {
        log.info('screen.displaySet for ' + componentIndex);
        this.write(constants.SCREEN_MSG.set, 1, 0);
    };

    /**
     * Helper message combines writing the given message to the screen at (optional) given coordinates
     *
     * @param {string} msg the string to ouput to the screen
     * @param {int} col (optional) 0-indexed column number to set the cursor
     * @param {int} row (optional) 0-indexed row number to set the cursor
     * @public
     */
    this.write = function (msg, col, row) {
        //log.info('screen.write msg ' + msg);
        var i;
        if (!(col === undefined || row === undefined)) {
            lcd.setCursor(col, row);
            for (i = 0; i < 10000000; i = i + 1) {
                //wait for slow LCD
            }
        }
        lcd.write(msg);
    };

    //initialize the LCD screen during instatiation
    this.resetAndTurnOff();
};

/**
 * Creates a new Mailer object to send mail over SMTP
 * @requires nodemailer
 * @param {Logger} log object for logging output
 * @see constants.MAIL Use the properties of constants.MAIL to configure your SMTP service
 * @class
 */
var Mailer = function (log) {
    log.info('instatiate Mailer');

    /**
     * Instance options taken from constants.MAIL are used by createTransport to authenticate SMTP
     * @private
     */
    var mailOptions = {
            from: constants.MAIL.from,       // sender address
            to: constants.MAIL.brushTo[0],   // list of receivers
            subject: constants.MAIL.subject, // Subject line
            text: constants.MAIL.body,       // plaintext body
            html: constants.MAIL.body        // html body
        },

        transporter = MAILER.createTransport({
            service: constants.MAIL.service,
            auth: {
                user: constants.MAIL.user,
                pass: constants.MAIL.pass
            }
        });

    /**
     * Sends the message defined in constants.MAIL for the given toothbrush.
     * Errors are sent to the log Logger object.
     * @param {int} componentIndex identifies the toothbrush by it's array index in constants
     * @public
     */
    this.sendCongratsEmail = function (componentIndex) {
        log.info('mailer.sendCongratsEmail for ' + componentIndex);
        mailOptions.to = constants.MAIL.brushTo[componentIndex];
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                log.err('mail error ' + error + '.');
            } else {
                log.info('mail sent.');
            }
        });
    };
};

/**
 * Creates a new Metrics object to connect to Intel Cloud Analytics over TCP
 * @requires net:socket
 * @param {Logger} log object for logging output
 * @class
 */
var Metrics = function (log) {
    log.info('instatiate metrics');

    /** 
     * instance objects and options to connect over TCP to Edison iot-agent
     * @private
     */
    var client = new NET.Socket(),
        options = {
            host : 'localhost', //use the Intel analytics client running locally on the Edison
            port : 7070         //on default TCP port
        };

    /** 
     * sendObservation concatenates the string expected by cloud analytics based on the parameter values
     * @param {string} name custom component name registered with Intel analytics
     * @param {float} value data value to send to cloud
     * @private 
     */
    function sendObservation(name, value) {
        log.debug('(metrics.sendObservation for ' + name + ', ' + value + ')');
        var msg = JSON.stringify({
                n: name,
                v: value
            }),
            sentMsg = msg.length + "#" + msg; //syntax for Intel analytics

        client.write(sentMsg);
    }

    /**
     * Method combines the activity of connecting to the Edision service and then sending data to the cloud
     * @param {int} itemIndex array index of component names registered with Intel analytics
     * @param {float} timeValue data value to send to cloud, expecting fractional number of seconds
     * @public
     */
    this.addDataToCloud = function (itemIndex, timeValue) {
        log.info('metrics.addDataToCloud for ' + itemIndex + ', ' + timeValue);
        client.on('error', function () {
            log.err('Could not connect to cloud');
        });
        client.connect(options.port, options.host, function () {
            sendObservation(constants.METRICS.brushComponent[itemIndex], timeValue);
        });
    };
};

/**
 * Creates a new Teeth object to manage the countdown timer
 * @param {Logger} log object for logging output
 * @param {Sensors} sensor object for listening to hardware sensors
 * @param {Buzzer} buzzer object for controlling the sounds
 * @param {Screen} screen object for display on the RGB LCD screen
 * @param {Mailer} mailer object for sending email
 * @param {Metrics} metrics object for sending data to cloud
 * @see constants.TIME Use the properties of constants.TIME to adjust the length of the countdown
 * @class
 */
var Teeth = function (log, sensors, buzzer, lcdScreen, mailer, metrics) {
    log.info('instatiate teeth');

    /**
     * flags to make sure fadeColor only called once for each color
     * @private
     */
    var fades = [],
        currentComponent = -1,
        timeSpent = 0;

    /** 
     * clearAllTimers loops through all timers in constants to clear them and set to null
     * @private 
     */
    function clearAllTimers() {
        log.debug('(teeth.clearAllTimers)');
        var key,
            timer;

        for (key in timers) {
            if (timers.hasOwnProperty(key)) {
                timer = timers[key];
                if (timer !== null) {
                    clearTimeout(timer);
                    timer = null;
                }
            }
        }
        fades = [];
        currentComponent = -1;
    }

    /** 
     * finishCountdown clears the screen, plays the stop sound, and starts the waiting process again
     * @param {int} componentIndex array index number of the toothbrush that is finishing the countdown
     * @private 
     */
    function finishCountdown(componentIndex) {
        log.debug('(teeth.finishCountdown for ' + componentIndex + ')');
        clearAllTimers();

        lcdScreen.reset();
        buzzer.playStopSound();
        mailer.sendCongratsEmail(componentIndex);
        lcdScreen.write(constants.SCREEN_MSG.finish);
        metrics.addDataToCloud(componentIndex, constants.TIME.brushGoaltime[componentIndex]);
        setTimeout(function () {
            lcdScreen.resetAndTurnOff();
            wait();
        }, 1000);
    }

    /** 
     * countdown generates messages and colors to the screen during the countdown, 
     *   called continuously until time is over
     * @param {int} componentIndex array index number of the toothbrush that is in the middle of the countdown
     * @param {int} timeRemaining the amount of time remaining in seconds before the countdown is over
     * @private 
     */
    function countdown(componentIndex, timeRemaining) {
        log.debug('(teeth.countdown for ' + componentIndex + ': ' + timeRemaining + ')');
        var originalValue = constants.TIME.brushGoaltime[componentIndex];
        timeSpent = originalValue - timeRemaining;

        if (timeRemaining > 0) {
            lcdScreen.write(constants.SCREEN_MSG.countdown + timeRemaining + '  ', 0, 0);

            if (timeRemaining <= (0.25 * originalValue)) {
                lcdScreen.write(constants.SCREEN_MSG.percent25, 1, 0);
                if (fades[constants.COLOR.percent25] !== 1) {
                    lcdScreen.fadeColor(constants.COLOR.percent25);
                    fades[constants.COLOR.percent25] = 1;
                }
            } else if (timeRemaining <= (0.5 * originalValue)) {
                lcdScreen.write(constants.SCREEN_MSG.percent50, 1, 0);
                if (fades[constants.COLOR.percent50] !== 1) {
                    lcdScreen.fadeColor(constants.COLOR.percent50);
                    fades[constants.COLOR.percent50] = 1;
                }
            } else if (timeRemaining <= (0.75 * originalValue)) {
                lcdScreen.write(constants.SCREEN_MSG.percent75, 1, 0);
                if (fades[constants.COLOR.percent75] !== 1) {
                    lcdScreen.fadeColor(constants.COLOR.percent75);
                    fades[constants.COLOR.percent75] = 1;
                }
            }

            timers.countdown = setTimeout(function () {
                countdown(componentIndex, timeRemaining - 1);
            }, 1000);
        } else {
            finishCountdown(componentIndex);
        }
    }

    /** 
     * startCountdown plays the sound and begins the first call to countdown
     * @param {int} componentIndex array index number of the toothbrush that is starting the countdown
     * @private 
     */
    function startCountdown(componentIndex) {
        log.info('(teeth.startCountdown for ' + componentIndex + ')');
        buzzer.playStartSound();
        lcdScreen.reset();

        currentComponent = componentIndex;
        countdown(componentIndex, constants.TIME.brushGoaltime[componentIndex]);
    }

    /** 
     * prepCountdown prepares the screen and waits for real countdown to begin, displays
     *   an additional warning with five seconds to go
     * @param {int} componentIndex array index number of the toothbrush that is starting the countdown
     * @private 
     */
    function prepCountdown(componentIndex) {
        log.debug('(teeth.prepCountdown for ' + componentIndex + ')');
        lcdScreen.displayReady(componentIndex);
        var prepTime = constants.TIME.brushPreptime[componentIndex];
        timers.prepCountdown = setTimeout(function () {
            log.debug('setTimeout: prepCountdown');
            lcdScreen.displaySet(componentIndex);
        }, (prepTime - 5) * 1000);
        timers.startCountdown = setTimeout(function () {
            log.debug('setTimeout: startCountdown');
            startCountdown(componentIndex);
        }, prepTime * 1000);
    }

    /** 
     * watchForLightsOut polls the photoresistor to see if the room is dark, then stops all activity
     * @private 
     */
    function watchForLightsOut() {
        //do not log.debug >> called every 50ms
        return;
        var val = sensors.roomLightSensor.read();

        if (val < constants.PINS.roomLightThreshold) {
            log.info('Trigger for lights out: Stop Timer (early) then wait 5 seconds to start again');
            if (currentComponent >= 0) {
                metrics.addDataToCloud(currentComponent, timeSpent);
            }
            clearAllTimers();
            lcdScreen.resetAndTurnOff();
            setTimeout(wait, 5000);
        }
    }

    /** 
     * wait is the main entry to this class, it polls the switches regularly to see if it should start the countdown
     * @private 
     */
    function wait() {
        //do not log.debug >> called every 100ms
        var i,
            val;

        for (i = 0; i < sensors.brushSwitch.length; i = i + 1) {
            val = sensors.brushSwitch[i].read();
            if (val === 0) { //0 for NO (normally open switch), 1 for NC (normally closed)
                log.info('Trigger for toothbrush ' + i + ': Start Timer');
                prepCountdown(i);
                timers.lightsOut = setInterval(watchForLightsOut, 50);
                break;
            }
        }

        if (i >= sensors.brushSwitch.length) {
            setTimeout(wait, 100);
        }
    }

    /**
     * Entry point to Teeth, the start command initiates the Smart Toothbrush Holder and begins the process of waiting for a countdown
     * @public
     */
    this.start = function () {
        log.info('Teeth.start waiting for toothbrush events');
        wait();
    };
};

/* Create instance objects of the classes needed by TEETH */
var log = new Logger(),
    sensors = new Sensors(log),
    buzzer = new Buzzer(log),
    lcdScreen = new Screen(log),
    mailer = new Mailer(log),
    metrics = new Metrics(log),
    teeth = new Teeth(log, sensors, buzzer, lcdScreen, mailer, metrics);

/* Get the code running by invoking the start method of the Teeth controller */
teeth.start();
