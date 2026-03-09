# signalk-hlp-bms-plugin

SignalK plugin to communicate with HLP-data BMS (Battery Management System) via serial connection.

## Features

- Reads battery data from HLP BMS over serial port
- Publishes data as SignalK paths
- Supports multiple battery cells monitoring
- Temperature monitoring (battery, motor, alternator)
- State of Charge (SOC) calculation (instant and average)
- Cell voltage balancing monitoring
- Configurable zones for notifications
- Support for auxiliary battery (AGM)
- Wait-for-response system to handle BMS communication delays
- **Control API**: Mute alarm buzzer and control charging via REST endpoints

## Installation

```bash
cd ~/.signalk
npm install signalk-hlp-bms-plugin
```

## Configuration

Configure the plugin through SignalK admin interface:

- **Serial Port**: Path to serial device (e.g., `/dev/ttyUSB0`)
- **Baud Rate**: 9600 (default for HLP BMS)
- **Poll Interval**: How often to query the BMS (milliseconds)
- **Battery Chemistry**: LiFePO4 or AGM (affects zone settings)
- **Zone Settings**: Configure voltage, temperature, current thresholds for notifications

## SignalK Paths

The plugin publishes data to the following SignalK paths:

### Battery Data
- `electrical.bms.voltage` - Total battery voltage (V)
- `electrical.bms.current` - Battery current (A)
- `electrical.bms.cellVoltage.1-4` - Individual cell voltages (V)
- `electrical.bms.unbalance` - Voltage difference between highest and lowest cell (V)

### State of Charge
- `electrical.bms.soc.instant` - Instantaneous SOC (ratio 0-1)
- `electrical.bms.soc.average` - Average SOC (ratio 0-1)

### Temperature
- `electrical.bms.temperature.battery` - Battery temperature (K)
- `electrical.bms.temperature.motor` - Motor temperature (K)
- `electrical.bms.temperature.generator` - Alternator/generator temperature (K)

### Auxiliary Battery
- `electrical.bms.battery2.voltage` - Auxiliary battery voltage (V)

## Notifications

The plugin automatically creates SignalK notifications based on configured zones:

- **Voltage alarms**: Low/high battery voltage
- **Temperature warnings**: Overheating detection
- **Cell imbalance alerts**: Uneven cell voltages
- **Current warnings**: Excessive charge/discharge rates

## Control API

The plugin provides REST API endpoints for controlling the BMS:

### Mute Alarm Buzzer

Mutes the BMS alarm buzzer when an alarm is active.

**Endpoint:** `POST /plugins/hlp-monitor-3/mute`

**Example:**
```bash
curl -X POST http://localhost:3000/plugins/hlp-monitor-3/mute
```

**Response:**
```json
{
  "status": "ok",
  "message": "Buzzer mute command sent"
}
```

### Charge Control

Controls the BMS charge function (enable/disable charging).

**Endpoint:** `POST /plugins/hlp-monitor-3/charge`

**Request Body:**
```json
{
  "value": true
}
```

- `value: true` - Enable charging (sends `bp=7` command to BMS)
- `value: false` - Disable charging (sends `bp=6` command to BMS)

**Example:**
```bash
# Enable charging
curl -X POST http://localhost:3000/plugins/hlp-monitor-3/charge \
  -H "Content-Type: application/json" \
  -d '{"value": true}'

# Disable charging
curl -X POST http://localhost:3000/plugins/hlp-monitor-3/charge \
  -H "Content-Type: application/json" \
  -d '{"value": false}'
```

**Response:**
```json
{
  "status": "ok",
  "command": "bp=7"
}
```

**Note:** These commands require the serial port to be open and connected to the BMS. If the port is not available, you will receive a `503 Service Unavailable` error.

## Version History

### v1.2.4 (2026-03-09)
- Fixed BMS response detection for po command
- Improved wait-for-response system
- Better handling of BMS communication timeouts

### v1.2.3
- Added wait-for-response system to handle BMS not responding to every command
- Improved serial communication reliability

### v1.2.2
- Added AGM battery support for auxiliary battery
- Configurable zones for different battery chemistries

### v1.2.1
- Added notification zones
- Improved meta data

## License

ISC

## Author

Magnus Leijonborg
