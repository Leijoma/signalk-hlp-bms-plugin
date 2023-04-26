
const serial = require('./lib/serial')

module.exports = function (app) {

  var plugin = {};
  var lastItems =[];
  var update_int=5000
  device='/dev/ttyUSB0';
  let myVar = setInterval(function(){serial.request()}, update_int);

  
  
  plugin.id = 'hlp-data-bms';
  plugin.name = 'HLP-Data BMS connector';
  plugin.description = 'Plugin that reads data from the HLP Data BMS and publish them in SignalK server';

  plugin.schema = {
    type: 'object',
    required: ['serial_port_name', 'update_interval'],
    properties: {
      serial_port_name: {
        type: 'string',
        title: 'Serial port (device name)'
      },
      update_interval: {
        type: 'number',
        title: 'Update interval (Seconds)',
        default: 5
      }
    }
  };

function parseMessage(message) {
  console.log('Message received: ',message)
  if (message !== 'm1') {
    var stringArray = message.split(',')//message.split(/(\s+)/);
    var items = [];
    var dataOk=true
    for(const val of stringArray) {
      items.push(val.replace(/[^\d.-]/g, ''))  
    }
    let temp=String(stringArray[13])
   // console.log(temp)
    temp=temp.slice(0,temp.length-2);
    temp=temp.slice(2);
    items[13]=Number(temp);
    // sanity check of items
    if (lastItems.length!=0) {
      for (let i = 0; i < 4; i++) {
        if ((Number(items[i])<(Number(lastItems[i])-1)) || (Number(items[i])>(Number(lastItems[i])+1))) {
          dataOk=false;
          console.log("Data ",i,"is not OK");
          console.log('Items: ',items)
          console.log('lastItems: ',lastItems)
        }
      }    
      if ((Number(items[6])<0) || (Number(items[6])>1)) {
        dataOk=false;
        console.log("Data 6 not OK")
      }
      if ((Number(items[7])<0) || (Number(items[7])>1)) {
        dataOk=false;
        console.log("Data 7 not OK")
      }
    }      
    if (dataOk) {
      lastItems=items
      var voltage=Number(items[0])+Number(items[1])+Number(items[2])+Number(items[3])
      console.log("Data OK") 
      app.handleMessage('signalk-hlp-bms-plugin', {
        updates :[ 
           {
           "meta": [
                  {
                  "path": "electrical.bms.lipo1.voltage",
                  "value": {
                      "description": "LiFePo4 cell 1 voltage",
                      "units": "V",
                      "displayName": "Cell 1 Voltage",
                      "timeout": 30
                      },
                  },
                  {
                      "path": "electrical.bms.lipo2.voltage",
                      "value": {
                        "description": "LiFePo4 cell 2 voltage",
                        "units": "V",
                        "displayName": "Cell 2 Voltage",
                        "timeout": 30
                        },
                  },
                  {
                      "path": "electrical.bms.lipo3.voltage",
                      "value": {
                        "description": "LiFePo4 cell 3 voltage",
                        "units": "V",
                        "displayName": "Cell 3 Voltage",
                        "timeout": 30
                        },
                  },
                  {
                      "path": "electrical.bms.lipo4.voltage",
                      "value": {
                        "description": "LiFePo4 cell 4 voltage",
                        "units": "V",
                        "displayName": "Cell 4 Voltage",
                        "timeout": 30
                        },
                  },
                  {
                    "path": "electrical.bms.shunt.current",
                    "value": {
                    "description": "BMS shunt current",
                    "units": "A",
                    "displayName": "BMS current",
                    "timeout": 30
                    },
                    },
                    {
                      "path": "electrical.bms.voltage",
                      "value": {
                      "description": "BMS voltage",
                      "units": "V",
                      "displayName": "BMS voltage",
                      "timeout": 30
                      },
                    },
                    {
                      "path": "electrical.bms.soc",
                      "value": {
                      "description": "BMS SOC",
                      "units": "%",
                      "displayName": "BMS SOC",
                      "timeout": 30
                      },
                  },
                  {
                    "path": "electrical.bms.charge.onoff",
                    "value": {
                    "description": "Charge on/off",
                    "units": "",
                    "displayName": "Charge on/off",
                    "timeout": 30
                    },
                },
                {
                  "path": "electrical.bms.loadoff",
                  "value": {
                  "description": "Load on/off",
                  "units": "",
                  "displayName": "Load on/off",
                  "timeout": 30
                  },
              },
              {
                  "path": "electrical.bms.battery2.voltage",
                  "value": {
                  "description": "BMS aux battery voltage",
                  "units": "V",
                  "displayName": "Starter Voltage",
                  "timeout": 30
                  },
              },
              {
                "path": "electrical.bms.socnow",
                "value": {
                "description": "BMS SOC now",
                "units": "V",
                "displayName": "BMSD SOC now",
                "timeout": 30
                },
            },
            {
              "path": "electrical.bms.battery.temperature",
              "value": {
              "description": "BMS temp 1",
              "units": "°",
              "displayName": "BMS temp 1",
              "timeout": 30
              },
             }      
            ]
          }
        ]
      });

      app.handleMessage('hlp-data-bms', {
        updates: [
          {
            values: [
              {
                path: 'electrical.bms.lipo1.voltage',
                value: Number(items[0]),
                units: 'V'
              },
              {
                path: 'electrical.bms.lipo2.voltage',
                value: Number(items[1]),
                units: 'V'
              },
              {
                path: 'electrical.bms.lipo3.voltage',
                value: Number(items[2]),
                units: 'V'
              },
              {
                path: 'electrical.bms.lipo4.voltage',
                value: Number(items[3]),
                units: 'V'
              },
              {
                path: 'electrical.bms.shunt.current',
                value: Number(items[4]),
                units: 'A'
              },
              {
                path: 'electrical.bms.voltage',
                value: Number(voltage.toFixed(2)),
                units: 'V'
              },
              {
                path: 'electrical.bms.soc',
                value: (Number(items[5]))/100,
                units: 'V'
              },
            
              {
                path: 'electrical.bms.charge.onoff',
                value: Number(items[6]),
                units: 'V'
              },
              {
                path: 'electrical.bms.loadoff',
                value: Number(items[7]),
                units: 'V'
              },
              {
                path: 'electrical.bms.battery2.voltage',
                value: Number(items[8]),
                units: 'V'
              },
              {
                path: 'electrical.bms.socnow',
                value: (Number(items[9
                ]))/100,
                units: 'V'
              },
              {
                path: 'electrical.bms.battery.temperature',
                value: Number(items[13]),
                units: 'V'
              }
              

            ]
          } 
      ]
    }) 
    }
    else 
        console.log("Data not OK")   
  }
  else {
    console.log("empty message...")
  }
}

  function UpdateData() {
     serial.request();
  }
  
  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    var serialPorts;
    console.log('******* HLP Plugin started **********');
    update_int=options.update_interval*1000;
    myVar = setInterval(function(){ UpdateData() }, update_int);
    device=options.serial_port_name;

    serial.open(device, parseMessage.bind())
    console.log('Serial: connecting to serial port')
  };

  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    clearInterval(myVar);
    serial.close();
    app.debug('Plugin stopped');
  };

  return plugin;
};



/*

  app.handleMessage('signalk-hlp-bms-plugin', {
        updates :[ 
           {
           "meta": [
                  {
                  "path": "electrical.bms.lipo1.voltage",
                  "value": {
                      "description": "LiFePo4 cell 1 voltage",
                      "units": "V",
                      "displayName": "Cell 1 Voltage",
                      "timeout": 30
                      },
                  },
                  {
                      "path": "electrical.bms.lipo2.voltage",
                      "value": {
                        "description": "LiFePo4 cell 2 voltage",
                        "units": "V",
                        "displayName": "Cell 2 Voltage",
                        "timeout": 30
                        },
                  },
                  {
                      "path": "electrical.bms.lipo3.voltage",
                      "value": {
                        "description": "LiFePo4 cell 3 voltage",
                        "units": "V",
                        "displayName": "Cell 3 Voltage",
                        "timeout": 30
                        },
                  },
                  {
                      "path": "electrical.bms.lipo4.voltage",
                      "value": {
                        "description": "LiFePo4 cell 4 voltage",
                        "units": "V",
                        "displayName": "Cell 4 Voltage",
                        "timeout": 30
                        },
                  },
                  {
                    "path": "electrical.bms.shunt.current",
                    "value": {
                    "description": "BMS shunt current",
                    "units": "A",
                    "displayName": "BMS current",
                    "timeout": 30
                    },
                    },
                    {
                      "path": "electrical.bms.voltage",
                      "value": {
                      "description": "BMS voltage",
                      "units": "V",
                      "displayName": "BMS voltage",
                      "timeout": 30
                      },
                    },
                    {
                      "path": "electrical.bms.soc",
                      "value": {
                      "description": "BMS SOC",
                      "units": "%",
                      "displayName": "BMS SOC",
                      "timeout": 30
                      },
                  },
                  {
                    "path": "electrical.bms.charge.onoff",
                    "value": {
                    "description": "Charge on/off",
                    "units": "",
                    "displayName": "Charge on/off",
                    "timeout": 30
                    },
                },
                {
                  "path": "electrical.bms.loadoff",
                  "value": {
                  "description": "Load on/off",
                  "units": "",
                  "displayName": "Load on/off",
                  "timeout": 30
                  },
              },
              {
                  "path": "electrical.bms.battery2.voltage",
                  "value": {
                  "description": "BMS aux battery voltage",
                  "units": "V",
                  "displayName": "Starter Voltage",
                  "timeout": 30
                  },
              },
              {
                "path": "electrical.bms.socnow",
                "value": {
                "description": "BMS SOC now",
                "units": "V",
                "displayName": "BMSD SOC now",
                "timeout": 30
                },
            },
            {
              "path": "electrical.bms.battery.temperature",
              "value": {
              "description": "BMS temp 1",
              "units": "°",
              "displayName": "BMS temp 1",
              "timeout": 30
              },
             }      
            ]
          }
        ]
      });

*/
