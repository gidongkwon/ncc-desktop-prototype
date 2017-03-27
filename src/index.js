const { electron, app, ipcMain, BrowserWindow, shell, clipboard } = require('electron');
const path = require('path');
const url = require('url');

let win;

function createWindow() {
    win = new BrowserWindow({width: 480, height: 800});

    win.loadURL(url.format({
        pathname: path.join(__dirname, '/html/chat.html'),
        protocol: 'file:',
        slashes: true
    }));

    win.webContents.on('new-window', (event, url) => {
        // use default electron window as photoviewer
        if (url.includes('phinf.naver.net'))
            return;

        // else use browser to open links
        event.preventDefault();
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

app.on('browser-window-focus', event => {
    win.flashFrame(false);
})

ipcMain.on('get-clipboard-image', event => {
    let isImage = clipboard.availableFormats().some(value => value.includes('image'));

    if (isImage) {
        event.returnValue = clipboard.readImage().toPNG();
    } else {
        event.returnValue = null;
    }
});