var Path = require('path');
var EventEmitter = require('events');
var USBDetect = require('usb-detection');
var ChildProcess = require('child_process');
var spawnFile = ChildProcess.spawn;
var ADB_PATH = Path.resolve(__dirname, 'adb');
var eventEmitter = new EventEmitter();

function adb_run(args, ret, serialNumber) {
	if (serialNumber) args = ['-s', serialNumber].concat(args);
	return ChildProcess.execFile(ADB_PATH, args, function(error, stdout, stderr) {
		ret(error, stdout);
	});
}

function adb_ls(path, ret, serialNumber) {
	adb_run(['shell', '-nT', 'ls', '-lLa',  path], function(error, lines) {
		var items = [], item;
		lines = (lines || '').split('\n');
		for (var c = 0; c < lines.length; c++) {
			var line = lines[c].split(/\s+/);
			if (line.length < 8) continue;
			var name = line.slice(7).join(' ');
			if (name.length > 1 && name[0] === '.') continue;
			var date = line[5].split('-'), time = line[6].split(':');
			items.push({
				name: Path.basename(name),
				size: parseInt(line[4], 10),
				isDir: (line[0][0] === 'd'),
				path: Path.resolve(path, name),
				date: (new Date(Date.UTC(date[0], parseInt(date[1]) - 1, date[2], time[0], time[1]))).getTime()
			});
		}
		ret(items);
	}, serialNumber);
}

function adb_devices(ret, serialNumber) {
	adb_run(['devices', '-l'], function(error, result) {
		var devices = [];
		if (!error) {
			result = (result || '').split('\n');
			nextLine: for (var c = 0; c < result.length; c++) {
				var line = result[c].split(/\s+|:/);
				var deviceSerialNumber = line.shift();
				if (!deviceSerialNumber || line.shift() !== 'device') continue nextLine;
				if (serialNumber && deviceSerialNumber !== serialNumber) continue nextLine;
				var device = {serialNumber: deviceSerialNumber};
				while (line.length) {
					var key = line.shift(), value = line.shift();
					if (!key || !value) continue nextLine;
					value = value.replace(/_/g, ' ');
					device[key] = value;
				}
				devices.push(device);
			}
		}
		ret(serialNumber ? devices[0] : devices);
	});
}

USBDetect.on('add', function(device) {
	var serialNumber = device.serialNumber;
	if (!serialNumber) return;

	console.info(device)

	var isConnected = false;

	var waitProcess = adb_run(['wait-for-usb-device'], function(error) {
		if (error) return;
		adb_devices(function(devices) {
			if (devices.length === 1) {
				isConnected = true;
				eventEmitter.emit('connected', devices);
			}
		}, serialNumber);
	}, serialNumber);

	USBDetect.once(`removed:${serialNumber}`, function() {
		if (isConnected) eventEmitter.emit('disconnected', serialNumber);
		waitProcess.kill();
	});
});

USBDetect.on('remove', function(device) {
	var serialNumber = device.serialNumber;
	if (serialNumber) USBDetect.emit(`removed:${serialNumber}`);
});

function start() {

	process.once('SIGINT', USBDetect.stopMonitoring);
	process.once('SIGTERM', USBDetect.stopMonitoring);
	process.once('uncaughtException', function(error) {
		console.info(error);
		USBDetect.stopMonitoring();
	});

	adb_devices(function(devices) {

		for (var c = 0; c < devices.length; c++) {
			var serialNumber = devices[c].serialNumber;
			USBDetect.once(`removed:${serialNumber}`, function() {
				eventEmitter.emit('disconnected', serialNumber);
			});
		}

		eventEmitter.emit('connected', devices);
		USBDetect.startMonitoring();

	});
}

module.exports = Object.assign(eventEmitter, {
	start: start,
	run: adb_run,
	ls: adb_ls,
	devices: adb_devices
});