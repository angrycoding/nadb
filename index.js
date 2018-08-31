var Path = require('path');
var ChildProcess = require('child_process');
var ADB_PATH = Path.resolve(__dirname, 'adb');

var watchProcess = null;
var activeDevices = {};

function adb_run(args, ret, serialNumber) {
	if (serialNumber) args = ['-s', serialNumber].concat(args);
	return ChildProcess.execFile(ADB_PATH, args, function(error, stdout, stderr) {
		ret(error, stdout);
	});
}

function adb_push(local, remote, ret, serialNumber) {
	if (!serialNumber) return ret(true);
	adb_run(['push', local, remote], (error) => ret(error), serialNumber);
}

function adb_pull(remote, local, ret, serialNumber) {
	if (!serialNumber) return ret(true);
	adb_run(['pull', remote, local], (error) => ret(error), serialNumber);
}

/*
function adb_ls(path, ret, serialNumber) {
	if (!serialNumber) return ret([]);

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
*/

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

function watch(handler) {
	if (watchProcess) return;
	watchProcess = ChildProcess.spawn(ADB_PATH, ['track-devices']);
	watchProcess.stdout.on('data', () => adb_devices(function(devices) {

		var connected = [], disconnected = [],
			serialNumbers = devices.map(device => device.serialNumber);

		for (var serialNumber in activeDevices) {
			if (activeDevices.hasOwnProperty(serialNumber) &&
				!serialNumbers.includes(serialNumber)) {
				disconnected.push(activeDevices[serialNumber]);
				delete activeDevices[serialNumber];
			}
		}

		while (devices.length) {
			var device = devices.shift(), serialNumber = device.serialNumber;
			if (activeDevices.hasOwnProperty(serialNumber)) continue;
			connected.push(activeDevices[serialNumber] = device);
		}

		handler(connected, disconnected);
	}));
}

module.exports = {
	watch: watch,
	run: adb_run,
	ls: adb_ls,
	push: adb_push,
	pull: adb_pull,
	devices: adb_devices
};