const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

module.exports = function (app) {
  app.debug('hlp-monitor-3 laddad – version 1.2.4');
  let plugin = {};
  let port, parser, interval;
  let pollCounter = 0;
  let activeAlarms = {};
  let waitingForResponse = false;
  let lastCommandSent = null;
  let responseTimeout = null;

  plugin.id = 'hlp-monitor-3';
  plugin.name = 'hlp monitor 3';
  plugin.description = 'Läser data från BMS4S över serieport och publicerar till SignalK';

  plugin.schema = {
    type: 'object',
    properties: {
      serialPort: {
        type: 'string',
        title: 'Seriell port',
        default: '/dev/ttyUSB0'
      },
      pollInterval: {
        type: 'number',
        title: 'Uppdateringsfrekvens (ms)',
        default: 10000
      },
      alarmCheckInterval: {
        type: 'number',
        title: 'Antal polls mellan alarm-kontroller',
        default: 3
      },
      unbalanceAlarmLimit: {
        type: 'number',
        title: 'Larmnivå för cell-unbalance (V)',
        default: 0.02
      },
      // AGM Aux Battery Zones (battery2)
      agmVoltageNominalLower: {
        type: 'number',
        title: 'AGM Aux Battery - Nominal min (V)',
        default: 12.0
      },
      agmVoltageNominalUpper: {
        type: 'number',
        title: 'AGM Aux Battery - Nominal max (V)',
        default: 13.8
      },
      agmVoltageWarnLower: {
        type: 'number',
        title: 'AGM Aux Battery - Varning min (V)',
        default: 11.5
      },
      agmVoltageWarnUpper: {
        type: 'number',
        title: 'AGM Aux Battery - Varning max (V)',
        default: 14.8
      },
      agmVoltageAlarmLower: {
        type: 'number',
        title: 'AGM Aux Battery - Larm min (V)',
        default: 11.0
      },
      agmVoltageAlarmUpper: {
        type: 'number',
        title: 'AGM Aux Battery - Larm max (V)',
        default: 15.5
      },
      // Engine Temperature Zones
      engineTempNominalUpper: {
        type: 'number',
        title: 'Motor temperatur - Nominal max (°C)',
        default: 85
      },
      engineTempWarnUpper: {
        type: 'number',
        title: 'Motor temperatur - Varning max (°C)',
        default: 95
      },
      engineTempAlarmUpper: {
        type: 'number',
        title: 'Motor temperatur - Larm max (°C)',
        default: 105
      },
      // Alternator Temperature Zones
      alternatorTempNominalUpper: {
        type: 'number',
        title: 'Alternator temperatur - Nominal max (°C)',
        default: 80
      },
      alternatorTempWarnUpper: {
        type: 'number',
        title: 'Alternator temperatur - Varning max (°C)',
        default: 100
      },
      alternatorTempAlarmUpper: {
        type: 'number',
        title: 'Alternator temperatur - Larm max (°C)',
        default: 120
      }
    }
  };

  // Alarm definitions based on BMS4S manual
  const alarmDefinitions = {
    2: { path: 'cellOvervoltage', message: 'Cell överspänning', state: 'alarm' },
    3: { path: 'cellUndervoltage', message: 'Cell underspänning', state: 'alarm' },
    4: { path: 'batteryOvervoltage', message: 'Batteri överspänning', state: 'alarm' },
    5: { path: 'batteryUndervoltage', message: 'Batteri underspänning', state: 'alarm' },
    6: { path: 'chargeOvercurrent', message: 'Laddningsöverström', state: 'alarm' },
    7: { path: 'dischargeOvercurrent', message: 'Urladdningsöverström', state: 'alarm' },
    8: { path: 'chargeOvertemperature', message: 'Laddning övertemperatur', state: 'alarm' },
    9: { path: 'dischargeOvertemperature', message: 'Urladdning övertemperatur', state: 'alarm' },
    10: { path: 'shortCircuit', message: 'Kortslutning', state: 'emergency' }
  };

  function publishZones(options) {
    app.debug('Publicerar SignalK zones baserat på konfigurerade gränser...');

    // LiFePO4 zones for main battery (hardcoded - standard for 4S LiFePO4)
    const cellVoltageZones = [
      { lower: 0, upper: 2.8, state: 'alarm' },
      { lower: 2.8, upper: 3.0, state: 'warn' },
      { lower: 3.0, upper: 3.2, state: 'alert' },
      { lower: 3.2, upper: 3.6, state: 'nominal' },
      { lower: 3.6, upper: 3.8, state: 'alert' },
      { lower: 3.8, upper: 4.0, state: 'warn' },
      { lower: 4.0, upper: 5.0, state: 'alarm' }
    ];

    const batteryVoltageZones = [
      { lower: 0, upper: 11.2, state: 'alarm' },
      { lower: 11.2, upper: 12.0, state: 'warn' },
      { lower: 12.0, upper: 12.8, state: 'alert' },
      { lower: 12.8, upper: 14.4, state: 'nominal' },
      { lower: 14.4, upper: 15.2, state: 'alert' },
      { lower: 15.2, upper: 16.0, state: 'warn' },
      { lower: 16.0, upper: 20.0, state: 'alarm' }
    ];

    // AGM zones for aux battery (configurable)
    const agmBatteryZones = [
      { lower: 0, upper: options.agmVoltageAlarmLower, state: 'alarm' },
      { lower: options.agmVoltageAlarmLower, upper: options.agmVoltageWarnLower, state: 'warn' },
      { lower: options.agmVoltageWarnLower, upper: options.agmVoltageNominalLower, state: 'alert' },
      { lower: options.agmVoltageNominalLower, upper: options.agmVoltageNominalUpper, state: 'nominal' },
      { lower: options.agmVoltageNominalUpper, upper: options.agmVoltageWarnUpper, state: 'alert' },
      { lower: options.agmVoltageWarnUpper, upper: options.agmVoltageAlarmUpper, state: 'warn' },
      { lower: options.agmVoltageAlarmUpper, upper: 20.0, state: 'alarm' }
    ];

    // Battery temperature zones (hardcoded - LiFePO4 safe range)
    const batteryTempNominal = 273.15 + 35;  // 35°C
    const batteryTempWarn = 273.15 + 45;     // 45°C
    const batteryTempAlarm = 273.15 + 50;    // 50°C
    const tempMax = 273.15 + 80;             // 80°C

    const batteryTemperatureZones = [
      { lower: 273.15, upper: batteryTempNominal, state: 'nominal' },
      { lower: batteryTempNominal, upper: batteryTempWarn, state: 'alert' },
      { lower: batteryTempWarn, upper: batteryTempAlarm, state: 'warn' },
      { lower: batteryTempAlarm, upper: tempMax, state: 'alarm' }
    ];

    // Engine temperature zones (configurable)
    const engineTempNominal = 273.15 + options.engineTempNominalUpper;
    const engineTempWarn = 273.15 + options.engineTempWarnUpper;
    const engineTempAlarm = 273.15 + options.engineTempAlarmUpper;

    const engineTemperatureZones = [
      { lower: 273.15, upper: engineTempNominal, state: 'nominal' },
      { lower: engineTempNominal, upper: engineTempWarn, state: 'alert' },
      { lower: engineTempWarn, upper: engineTempAlarm, state: 'warn' },
      { lower: engineTempAlarm, upper: tempMax, state: 'alarm' }
    ];

    // Alternator temperature zones (configurable)
    const alternatorTempNominal = 273.15 + options.alternatorTempNominalUpper;
    const alternatorTempWarn = 273.15 + options.alternatorTempWarnUpper;
    const alternatorTempAlarm = 273.15 + options.alternatorTempAlarmUpper;

    const alternatorTemperatureZones = [
      { lower: 273.15, upper: alternatorTempNominal, state: 'nominal' },
      { lower: alternatorTempNominal, upper: alternatorTempWarn, state: 'alert' },
      { lower: alternatorTempWarn, upper: alternatorTempAlarm, state: 'warn' },
      { lower: alternatorTempAlarm, upper: tempMax, state: 'alarm' }
    ];

    const socZones = [
      { lower: 0, upper: 0.1, state: 'alarm' },    // <10%
      { lower: 0.1, upper: 0.2, state: 'warn' },   // 10-20%
      { lower: 0.2, upper: 0.3, state: 'alert' },  // 20-30%
      { lower: 0.3, upper: 1.0, state: 'nominal' } // >30%
    ];

    const zones = [
      // Cell voltages (4 cells) - using actual paths from data publishing
      {
        path: 'electrical.bms.cellVoltage.1',
        meta: { units: 'V', zones: cellVoltageZones }
      },
      {
        path: 'electrical.bms.cellVoltage.2',
        meta: { units: 'V', zones: cellVoltageZones }
      },
      {
        path: 'electrical.bms.cellVoltage.3',
        meta: { units: 'V', zones: cellVoltageZones }
      },
      {
        path: 'electrical.bms.cellVoltage.4',
        meta: { units: 'V', zones: cellVoltageZones }
      },
      // Battery voltage
      {
        path: 'electrical.bms.voltage',
        meta: { units: 'V', zones: batteryVoltageZones }
      },
      // Aux voltage (battery2) - AGM battery with different zones
      {
        path: 'electrical.bms.battery2.voltage',
        meta: { units: 'V', zones: agmBatteryZones }
      },
      // Current (bidirectional - negative for discharge, positive for charge)
      {
        path: 'electrical.bms.current',
        meta: {
          units: 'A',
          zones: [
            { lower: -100, upper: -50, state: 'alarm' },   // Heavy discharge
            { lower: -50, upper: -30, state: 'warn' },     // High discharge
            { lower: -30, upper: 20, state: 'nominal' },   // Normal range
            { lower: 20, upper: 30, state: 'warn' },       // High charge
            { lower: 30, upper: 100, state: 'alarm' }      // Excessive charge
          ]
        }
      },
      // Temperatures
      {
        path: 'electrical.bms.temperature.motor',
        meta: { units: 'K', zones: engineTemperatureZones }
      },
      {
        path: 'electrical.bms.temperature.generator',
        meta: { units: 'K', zones: alternatorTemperatureZones }
      },
      {
        path: 'electrical.bms.temperature.battery',
        meta: { units: 'K', zones: batteryTemperatureZones }
      },
      // SoC
      {
        path: 'electrical.bms.soc.instant',
        meta: { units: 'ratio', zones: socZones }
      },
      {
        path: 'electrical.bms.soc.average',
        meta: { units: 'ratio', zones: socZones }
      },
      // Cell unbalance
      {
        path: 'electrical.bms.unbalance',
        meta: {
          units: 'V',
          zones: [
            { lower: 0, upper: options.unbalanceAlarmLimit, state: 'nominal' },
            { lower: options.unbalanceAlarmLimit, upper: 0.05, state: 'alert' },
            { lower: 0.05, upper: 0.1, state: 'warn' },
            { lower: 0.1, upper: 1.0, state: 'alarm' }
          ]
        }
      }
    ];

    // Publish all meta in a single update
    const metaArray = zones.map(({ path, meta }) => ({ path, value: meta }));

    app.handleMessage(plugin.id, {
      updates: [{
        meta: metaArray
      }]
    });

    app.debug(`✓ SignalK zones publicerade för ${metaArray.length} paths`);
    app.debug('SignalK notificationhandler kommer automatiskt skapa notifications baserat på zones');
  }

  function handleAlarmResponse(response, options) {
    app.debug('BMS alarm-status:', response);

    // Parse alarm code from response (format: "po XX" where XX is the alarm code)
    const match = response.match(/po\s*(\d+)/);
    if (!match) {
      app.debug('Kunde inte tolka alarm-svar:', response);
      return;
    }

    const alarmCode = parseInt(match[1], 10);
    app.debug('BMS alarm-kod:', alarmCode);

    // Check if we have a new alarm
    if (alarmCode >= 2 && alarmCode <= 10) {
      const alarm = alarmDefinitions[alarmCode];
      if (alarm && !activeAlarms[alarmCode]) {
        // New alarm detected
        activeAlarms[alarmCode] = true;
        app.setPluginStatus(`🚨 BMS Larm: ${alarm.message}`);

        app.handleMessage(plugin.id, {
          notifications: {
            [`electrical.bms.alarm.${alarm.path}`]: {
              state: alarm.state,
              message: `BMS Larm: ${alarm.message}`,
              method: ['visual', 'sound']
            }
          }
        });

        app.debug(`⚠️ BMS Larm aktivt: ${alarm.message} (kod ${alarmCode})`);
      }
    } else if (alarmCode === 0 || alarmCode === 1) {
      // No alarm (0) or normal status (1) - clear all active alarms
      if (Object.keys(activeAlarms).length > 0) {
        app.debug('✓ BMS larm avaktiverade');
        app.setPluginStatus('Normal drift');

        // Clear all active alarm notifications
        const notifications = {};
        Object.keys(activeAlarms).forEach(code => {
          const alarm = alarmDefinitions[code];
          if (alarm) {
            notifications[`electrical.bms.alarm.${alarm.path}`] = {
              state: 'normal',
              message: ''
            };
          }
        });

        if (Object.keys(notifications).length > 0) {
          app.handleMessage(plugin.id, { notifications });
        }

        activeAlarms = {};
      }
    }
  }

  plugin.start = function (options) {
    app.debug('=== PLUGIN START ===');

    // Stop any existing connections first
    if (interval) {
      clearInterval(interval);
      interval = null;
      app.debug('⚠️ Cleared existing interval on start');
    }

    // Close and cleanup old port/parser
    if (parser) {
      parser.removeAllListeners();
      parser = null;
      app.debug('⚠️ Removed all parser listeners');
    }

    if (port) {
      if (port.isOpen) {
        port.close(() => {
          app.debug('⚠️ Closed existing port');
        });
      }
      port.removeAllListeners();
      port = null;
      app.debug('⚠️ Removed all port listeners');
    }

    pollCounter = 0;
    app.debug('Reset pollCounter to 0');

    plugin.setupRoutes();
    publishZones(options);

    port = new SerialPort({
      path: options.serialPort,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    });

    parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', line => {
      const trimmed = line.trim();
      app.debug('PARSER mottaget:', JSON.stringify(trimmed));

      // Ignore echo of commands
      if (trimmed === 'm1' || trimmed === 'po') return;

      // Check for buzzer status line (contains alarm code from po command)
      if (trimmed.startsWith('buzzer:')) {
        const buzzerMatch = trimmed.match(/buzzer:\s*(\d+)/);
        if (buzzerMatch) {
          const alarmCode = parseInt(buzzerMatch[1]);
          handleAlarmResponse(`po ${alarmCode}`, options);
        }
        return;
      }

      // Handle data response (both m1 and po commands return this format)
      if (trimmed.includes('a1') && trimmed.includes('b1') && trimmed.includes('m1')) {
        // Check if this is a response to m1 or po command
        const isPoResponse = trimmed.endsWith('po');
        const isM1Response = trimmed.endsWith('m1') || !isPoResponse;

        if (lastCommandSent === 'po' && isPoResponse) {
          waitingForResponse = false;
          if (responseTimeout) clearTimeout(responseTimeout);
          app.debug('✓ Received po data response, ready for next command');
        } else if (lastCommandSent === 'm1' && isM1Response) {
          waitingForResponse = false;
          if (responseTimeout) clearTimeout(responseTimeout);
          app.debug('✓ Received m1 response, ready for next command');
        }
        const msg = trimmed;
        const parts = msg.split(',').map(v => v.replace(/[^\d.-]/g, ''));

        if (parts.length >= 15) {
          const voltage = [parts[0], parts[1], parts[2], parts[3]].map(Number);
          const totalV = voltage.reduce((a, b) => a + b, 0);
          const unbalance = Math.max(...voltage) - Math.min(...voltage);
          const current = Number(parts[4]);
          const socAvg = Number(parts[5]) / 100;  // Convert % to ratio (0-1)
          const charge = Number(parts[6]) === 1;
          const load = Number(parts[7]) === 1;
          const auxVoltage = Number(parts[8]);
          const socNow = Number(parts[9]) / 100;  // Convert % to ratio (0-1)

          // Convert temperatures from Celsius to Kelvin (SignalK standard)
          const motorTemp = (Number((msg.match(/m1\s*(\d+)/) || [])[1] || 0)) + 273.15;
          const genTemp = (Number((msg.match(/a1\s*(\d+)/) || [])[1] || 0)) + 273.15;
          const battTemp = (Number((msg.match(/b1\s*(\d+)/) || [])[1] || 0)) + 273.15;

          // Cell unbalance - just update plugin status, SignalK handles notification via zones
          if (unbalance > options.unbalanceAlarmLimit) {
            app.setPluginStatus(`⚠️ Cell-unbalance för hög: ${unbalance.toFixed(3)} V`);
          } else {
            app.setPluginStatus('Normal drift');
          }

          // Note: Meta (units, zones) are published once at startup via publishZones()
          // Here we only send values - no meta to avoid overwriting zones

          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  { path: 'electrical.bms.cellVoltage.1', value: voltage[0] },
                  { path: 'electrical.bms.cellVoltage.2', value: voltage[1] },
                  { path: 'electrical.bms.cellVoltage.3', value: voltage[2] },
                  { path: 'electrical.bms.cellVoltage.4', value: voltage[3] },
                  { path: 'electrical.bms.voltage', value: totalV },
                  { path: 'electrical.bms.current', value: current },
                  { path: 'electrical.bms.soc.average', value: socAvg },
                  { path: 'electrical.bms.soc.instant', value: socNow },
                  { path: 'electrical.bms.unbalance', value: unbalance },
                  { path: 'electrical.bms.charge.onoff', value: charge },
                  { path: 'electrical.bms.charge.activate', value: charge },
                  { path: 'electrical.bms.load.onoff', value: load },
                  { path: 'electrical.bms.aux.voltage', value: auxVoltage },
                  { path: 'electrical.bms.temperature.motor', value: motorTemp },
                  { path: 'electrical.bms.temperature.generator', value: genTemp },
                  { path: 'electrical.bms.temperature.battery', value: battTemp },
                  { path: 'electrical.bms.battery2.voltage', value: auxVoltage }
                ]
              }
            ]
          });

          // NOTE: SignalK's built-in notificationhandler automatically creates
          // notifications based on zones. We do NOT need to send manual notifications!
          // The zones we published in publishZones() are used by SignalK to automatically
          // generate notifications when values go outside nominal ranges.
        }
      }
    });

    port.open(err => {
      if (err) {
        app.error('Kunde inte öppna serieport:', err.message);
        return;
      }

      app.debug('Serieport öppen:', options.serialPort);

      // Clear any existing interval before creating a new one
      if (interval) {
        clearInterval(interval);
        app.debug('⚠️⚠️⚠️ WARNING: Had to clear existing interval in port.open - this should not happen!');
      }

      app.debug('Creating new poll interval...');
      interval = setInterval(() => {
        if (!port || !port.isOpen) {
          app.debug('⚠️ Port ej öppen, hoppar över poll');
          return;
        }

        // Don't send new command if still waiting for response
        if (waitingForResponse) {
          app.debug('⚠️ Still waiting for response to previous command, skipping this poll');
          return;
        }

        pollCounter++;

        // Alternate between data polling (m1) and alarm checking (po)
        if (pollCounter % options.alarmCheckInterval === 0) {
          app.debug('» Kollar BMS alarm-status (po)');
          port.write('po\n');
          lastCommandSent = 'po';
          waitingForResponse = true;

          // Timeout after 8 seconds if no response
          responseTimeout = setTimeout(() => {
            app.debug('⚠️ Timeout waiting for po response');
            waitingForResponse = false;
            lastCommandSent = null;
          }, 8000);
        } else {
          app.debug('» Skickar data-förfrågan (m1)');
          port.write('m1\n');
          lastCommandSent = 'm1';
          waitingForResponse = true;

          // Timeout after 8 seconds if no response
          responseTimeout = setTimeout(() => {
            app.debug('⚠️ Timeout waiting for m1 response');
            waitingForResponse = false;
            lastCommandSent = null;
          }, 8000);
        }
      }, options.pollInterval);

      app.debug(`✓ Poll interval satt till ${options.pollInterval}ms (alarm var ${options.alarmCheckInterval}:e poll)`);
    });
  };

  plugin.setupRoutes = function () {
    app.get("/plugins/hlp-monitor-3/status", (req, res) => {
      res.json({
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.version,
        running: true,
        options: plugin.options,
      });
    });

    app.post("/plugins/hlp-monitor-3/charge", (req, res) => {
      const value = req.body?.value;
      if (typeof value !== 'boolean') {
        return res.status(400).json({ error: 'Missing or invalid `value` boolean in body' });
      }

      if (!port || !port.isOpen) {
        return res.status(503).json({ error: 'Serial port not open' });
      }

      const command = value ? "bp=7\n" : "bp=6\n";
      app.debug(`» skickar kommando till BMS: ${command.trim()}`);
      port.write(command, (err) => {
        if (err) {
          app.error('Kunde inte skriva laddkommando:', err.message);
          return res.status(500).json({ error: 'Serial write failed' });
        } else {
          if (plugin.options?.debugMode) {
            app.debug(`Laddkommando skickat: ${command.trim()}`);
          }
          return res.json({ status: 'ok', command });
        }
      });
    });

    app.post("/plugins/hlp-monitor-3/mute", (req, res) => {
      if (!port || !port.isOpen) {
        return res.status(503).json({ error: 'Serial port not open' });
      }

      // Send mute buzzer command (mb= command as per BMS4S manual)
      const command = "mb=\n";
      app.debug(`» skickar tysta summer-kommando till BMS: ${command.trim()}`);
      port.write(command, (err) => {
        if (err) {
          app.error('Kunde inte skriva tysta summer-kommando:', err.message);
          return res.status(500).json({ error: 'Serial write failed' });
        } else {
          app.debug('✓ Summer-kommando skickat');
          return res.json({ status: 'ok', message: 'Buzzer mute command sent' });
        }
      });
    });
  };

  plugin.stop = function () {
    app.debug('=== PLUGIN STOP ===');

    if (interval) {
      clearInterval(interval);
      interval = null;
      app.debug('✓ Cleared interval');
    }

    if (parser) {
      parser.removeAllListeners();
      parser = null;
      app.debug('✓ Removed parser listeners');
    }

    if (port) {
      if (port.isOpen) {
        port.close(() => {
          app.debug('✓ Port closed');
        });
      }
      port.removeAllListeners();
      port = null;
      app.debug('✓ Removed port listeners');
    }

    app.debug('=== PLUGIN STOPPED ===');
  };

  return plugin;
};
