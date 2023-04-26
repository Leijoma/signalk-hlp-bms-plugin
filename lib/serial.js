const {SerialPort} = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline')
let port = []
let delim = []
const parser=[]

module.exports = {
  open: (device, parseMessage) => {
    
   console.log(`Serial: connecting to ${device}`)
   
    port[0] = new SerialPort({path: device, baudRate: 9600}) // @NOTE FT: should this be configurable?
    parser[0] = port[0].pipe(new ReadlineParser({ delimiter: '\n' }))
    port[0].on('open', function() {
      app.debug(`Connected to ${device}`)
    })

    parser[0].on('data', data => {
    // console.log('Data to parse: ',data)
     parseMessage(data)
    
    })

    port[0].on('error', err => {
      app.debug(`SerialPort error: ` + err.message)
    })
  },
  request: () => {
    port[0].write('m1\n')
  },
  close: ( ) => {
    if (port[0]) {
      try {
        port[0].close()
        port[0] = undefined
        app.debug(`Serial port closed`);
      } catch (e) {}
    }
  }
}