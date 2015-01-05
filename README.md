TEETH Toothbrush Holder IoT App
============================
A node.js application using the Intel Edison board. 

TEETH is Timer Encouraging Everyone to Health. It is just one part of encouraging IOT in the most important room of the house -- The Bathroom 2.0 Movement.

Description
--------------------------
The Smart TEETH Toothbrush holder uses sensors to arm a timer when you remove your touthbrush. After time to get your toothpaste ready, it begins a timer with an encouraging sound.

The timer uses encouraging text and pleasant colors -- moving to green -- to coach you to the ADA recommended 2 minute brushing time.

If you complete the timer, you get a pleasing end sound and an email congrats!

If instead, you leave the room and turn out the lights, the Smart TEETH technology pays attention. The timer stops early without complaint.

Every session is sent to cloud. You will see how many times a day you brushed, and if you met the ADA goal.

The Smart TEETH toothbrush holder is great for health-conscious folks, or those under dental supervision. The code supports multi-toothbrush models -- great for families who need to encourage children's brushing habits too!


Building TEETH
----------------------------
To build your own TEETH Smart Toothbrush Holder you will need
* Touch sensitive switches
* Color LCD screen using I2C
* Light sensor
* Intel Edison Board
* Intel IoT Analytics Dashboard
* An e-mail account for SMTP services

See the step-by-step instructions at http://instructables.com/

To rebuild this documentation run
* jsdoc main.js README.md -d docs


Important App Files
---------------------------
* main.js -- all code needed for this project
* package.json -- node.js description file
* icon.png -- icon displayed in Intel XDK IDE
* README.md -- this file
* toothbrush-timer.xdk -- definition file used by Intel XDK
* toothbrush-timer.xdke -- definitino file used by Intel XDK


Important Terminal Commands for Edison
---------------------------
connect to linux command line as root
* screen /dev/tty.usbserial-(tab) 115200 -L

configure wireless connection
* configure_edison --wifi

find IP address
* ip a

determine space available
* df -h

delete journal files
* rm -rf /var/log/journal


Important Intel IoT Analytics Commands for Edison
---------------------------
Dashboard website
* https://dashboard.us.enableiot.com/v1/ui/dashboard#/chart

Confirm iotkit agent is configured
* iotkit-admin test

Get catalog list from Intel
* iotkit-admin catalog

Register a component from the catalog to this Edison
* iotkit-admin register <component_name> <catalogid>

List registered components on this Edison
* iotkit-admin components

Send test data to cloud
* iotkit-admin observation <component_name> <value> 

start the IOT Cloud Analytics agent
* systemctl start iotkit-agent


License Information Follows
---------------------------
Copyright (c) 2014, Nathan Carver. All rights reserved.

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
