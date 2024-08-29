'use strict';
require('../../room/setup/clearing/clearing.js');

let nodejs = require('./nodejs.js');

let platform = (process.platform === 'win32') ? 'win32' : 'posix';
if (nodejs.path !== nodejs.path[platform]) throw Error('Unsupported platform').mod({ platform: process.platform, path: nodejs.path });

// Win32 FsKeeps can be used even on posix systems, so this defaults to a sensible value even when
// there's no actual sense of a "default drive"!
let win32DefaultDrive = platform === 'win32' ? __dirname.split(/[/\\]/)[0]/*.lower()*/ : 'C:';
if (win32DefaultDrive.length !== 2) throw Error('Unexpected win32 drive').mod({ drive: win32DefaultDrive });

module.exports = { platform, win32DefaultDrive, tempNode: nodejs.os.tmpdir() };