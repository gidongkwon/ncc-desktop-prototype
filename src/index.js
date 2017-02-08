const { electron, app, ipcMain, BrowserWindow, shell, clipboard } = require('electron');
const path = require('path');
const url = require('url');

let win;

function createWindow() {
    win = new BrowserWindow({width: 480, height: 800, minWidth: 350, minHeight: 350});

    win.loadURL(url.format({
        pathname: path.join(__dirname, '/html/index.html'),
        protocol: 'file:',
        slashes: true
    }));

    win.webContents.on('new-window', function(e, url) {
        // use default electron window as photoviewer
        if (url.includes('phinf.naver.net'))
            return;

        // else use browser to open links
        e.preventDefault();
        shell.openExternal(url);
    });

    win.on('closed', () => {
        win = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform != 'darwin')
        app.quit();
})

app.on('activate', () => {
    if (win === null) {
        createWindow();
    }
})

app.on('browser-window-focus', (event) => {
    win.flashFrame(false);
})

ipcMain.on('get-clipboard-image', (event) => {
    let isImage = clipboard.availableFormats().some(value => value.includes('image'));

    if (isImage) {
        event.returnValue = clipboard.readImage().toPNG();
    } else {
        event.returnValue = null;
    }
});