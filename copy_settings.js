const fse = require('fs-extra');
const path = require('path');

fse.copy(path.join(__dirname, '/settings_empty'), path.join(__dirname, process.argv[2]), err => {
    if (err) return console.error(err);
    return console.log('Copied settings folder');
});