window.addEventListener('keydown', window_handleKeyDown);

const Session = require('node-ncc-es6/lib/session').default;
const Credentials = require('node-ncc-es6/lib/credentials').default;
const Room = require('node-ncc-es6/lib/room').default;
const fs = require('fs');
const stream = require('stream');
const { remote, ipcRenderer } = require('electron');
const { dialog } = remote;
const readChunk = require('read-chunk');
const fileType = require('file-type');
const searchInPage = require('electron-in-page-search').default;
const inPageSearch = searchInPage(remote.getCurrentWebContents());

const config = JSON.parse(fs.readFileSync('./settings/chat.config.json'));
const user = JSON.parse(fs.readFileSync('./settings/user.json'));

const notifyRegExps = config.notifyRegExps.map(value => new RegExp(value, 'gim'));

let credentials = new Credentials(user.id, user.password);
let session = new Session(credentials);

const input = document.getElementById('input');
const chatContainer = document.getElementById('chat-container');
const uploadImageButton = document.getElementById('upload-image');

let synced = false;
let me = null;

const escape = document.createElement('textarea');

function escapeHTML(html) {
    escape.textContent = html;
    return escape.innerHTML;
}

function unescapeHTML(html) {
    escape.innerHTML = html;
    return escape.textContent;
}

// https://gist.github.com/dperini/729294
const urlReg = new RegExp(
    "(" +
    // protocol identifier
    "(?:(?:https?|ftp)://)" +
    // user:pass authentication
    "(?:\\S+(?::\\S*)?@)?" +
    "(?:" +
    // IP address exclusion
    // private & local networks
    "(?!(?:10|127)(?:\\.\\d{1,3}){3})" +
    "(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})" +
    "(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +
    // IP address dotted notation octets
    // excludes loopback network 0.0.0.0
    // excludes reserved space >= 224.0.0.0
    // excludes network & broacast addresses
    // (first & last IP address of each class)
    "(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" +
    "(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" +
    "(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" +
    "|" +
    // host name
    "(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)" +
    // domain name
    "(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*" +
    // TLD identifier
    "(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))" +
    // TLD may end with dot
    "\\.?" +
    ")" +
    // port number
    "(?::\\d{2,5})?" +
    // resource path
    "(?:[/?#]\\S*)?" +
    ")", "gim"
);

let mainRoom = new Room(session, config.roomId);
mainRoom.cafe = {
    id: config.cafeId
};

new Promise((resolve, reject) => {
        fs.readFile('./auth.json', 'utf8', (err, data) => {
            if (err) return reject(err);
            return resolve(data);
        });
    })
    .then(JSON.parse, () => null)
    .then(cookieJar => credentials.setCookieJar(cookieJar))
    .then(() => credentials.validateLogin())
    .then(username => {
        console.log('Logged in with username', username);
    }, () => {
        console.log('Logging in');
        return credentials.login()
            .then(() => fs.writeFile('./auth.json',
                JSON.stringify(credentials.getCookieJar())));
    })
    .then(() => session.connect())
    .then(() => session.syncRoom(mainRoom)) // force-sync to fetch data of myself
    .then(room => {
        mainRoom = room;
        synced = true;

        remote.getCurrentWindow().setTitle(mainRoom.name);

        const lastId = mainRoom.lastMessage.id;

        return session.getMsg(mainRoom, lastId - config.initialMessages - 1, lastId);
    })
    .then(messages => {
        messages.map((value) => {
            value.old = true;
            receiveMessage(value);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    })
    .catch(error => {
        console.error(error.stack);
    });

session.on('error', error => {
    console.error(error);
});

document.body.addEventListener('drop', body_handleFileDrop);
document.body.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
});
input.addEventListener('keydown', sendMessage);
input.addEventListener('paste', handleImagePaste);
session.on('message', receiveMessage);

uploadImageButton.addEventListener('click', openUploadDialog);

function window_handleKeyDown(event) {
    if (event.key == 'F5') {
        event.preventDefault();
        remote.getCurrentWindow().reload();
    } else if (event.key == 'F12') {
        remote.getCurrentWindow().toggleDevTools();
    } else if (event.key == 'f' && event.ctrlKey) {
        if(inPageSearch.opened)
            inPageSearch.closeSearchWindow();
        else
            inPageSearch.openSearchWindow();
    }
}

function getPrevMessages(room, count, id) {
    session.getMsg(mainRoom, id - count - 1, id - 1)
        .then(messages => {
            messages.reverse();
            messages.map((value) => {
                value.old = true;
                receiveMessage(value, true);
            });
        });
}

function sendMessage(event) {
    if (!synced) return;

    let message = input.value;

    message = message.trim();

    if (event.type === 'keydown'
        && event.which === 13
        && !event.shiftKey
        && message !== '') {
        event.preventDefault();
        session.sendText(mainRoom, message);
        input.value = '';
    }
}

function receiveMessage(data) {
    if (data.room.id !== mainRoom.id)
        return;

    let { id, nickname, image } = data.user;
    let message = data.message;
    data.old = data.old || false;

    const haveToScroll = chatContainer.clientHeight === (chatContainer.scrollHeight - chatContainer.scrollTop);
    const isMe = id === session.username;

    if (id === 'rotate13') { // handle irc, discord bot
        const chatReg = /^(.*?): ([\s\S]*)$/m;

        const found = message.match(chatReg);

        if (found) {
            nickname = found[1];
            message = found[2];
        }
    }

    if (config.ignore &&
        config.ignore.users &&
        config.ignore.users.some(value => value === id))
        return;

    let chatElementClass = 'chat-item';

    const nicknameDiv = chatContainer.lastChild ? chatContainer.lastChild.getElementsByClassName('nickname')[0] : null;

    if (data.type !== 'join' &&
        data.type !== 'leave' &&
        data.type !== 'changeName' &&
        chatContainer.lastChild &&
        nicknameDiv &&
        nicknameDiv.getAttribute('user-id') === id &&
        nicknameDiv.firstChild.textContent === nickname) {
        chatElementClass += ' same-sender';
    }


    if (isMe)
        chatElementClass += ' me';

    let chatElementHTML = `<div class='profile-picture' style='background-image: url(${image})'></div>
                       <div class='nickname' user-id='${id}' title='${nickname} (${id})'><span>${nickname}</span></div>
                       <span class='colon'>:</span>`;

    let imageElement = null;

    switch (data.type) {
        case 'join':
            chatElementClass += ' highlight';
            chatElementHTML = `<div class='notification'>${nickname}님이 접속하셨습니다</div>`;
            break;
        case 'leave':
            chatElementClass += ' highlight';
            chatElementHTML = `<div class='notification'>${nickname}님이 퇴장하셨습니다</div>`;
            break;
        case 'changeName':
            chatElementClass += ' highlight';
            const hasJongseong = ((data.target.charCodeAt(data.target.length - 1)-0xAC00)%28) !== 0;
            chatElementHTML = `<div class='notification'>방 이름이 ${data.target}${hasJongseong?'으':''}로 변경되었습니다</div>`;
            remote.getCurrentWindow().setTitle(mainRoom.name);
            break;
            
        case 'text':
            const needNotify = notifyRegExps.some(regex => {
                return message.match(regex);
            });

            if (needNotify && !isMe) {

                chatElementClass += ' highlight';

                if (!data.old) {
                    new Notification(nickname, {
                        body: message
                    });
                }
            }

            messageEscaped = escapeHTML(message);
            messageEscapedWithURL = messageEscaped.replace(urlReg, '<a href="$1" target="_blank">$1</a>');

            chatElementHTML += `<div class='message'>${messageEscapedWithURL}\n</div>`
            
            break;
        case 'image':
            const sizeReg = /(^.*)\?type=ma1280$/m;

            chatElementHTML += `<a href='./image_viewer.html?src=${data.image}' target='_blank'>`;

            if (data.thumb === undefined) {
                data.thumb = data.image + '?type=w128'
            }

            imageElement = new Image();
            imageElement.src = data.thumb;
            imageElement.className = 'thumbnail';
            if (haveToScroll)
                imageElement.addEventListener('load', handleImageScroll);

            chatElementHTML += imageElement.outerHTML + '</a>'
            break;
        case 'sticker':
            imageElement = new Image();
            imageElement.src = data.image;
            imageElement.className = 'sticker';
            if (haveToScroll)
                imageElement.addEventListener('load', handleImageScroll);

            chatElementHTML += imageElement.outerHTML;
            break;
    }

    chatElement = document.createElement('div');
    chatElement.className = chatElementClass;
    chatElement.setAttribute('messageid', data.id);
    chatElement.innerHTML = chatElementHTML;

    if (!remote.getCurrentWindow().isFocused())
        remote.getCurrentWindow().flashFrame(true);

    chatContainer.appendChild(chatElement);

    if (haveToScroll) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function handleChatScroll(e) {
    if (chatContainer.scrollTop === 0) {
        getPrevMessages(mainRoom, 100, chatContainer.firstChild.getAttribute('messageid'));
    }
}

function handleImageScroll(e) {
    chatContainer.scrollTop += e.target.height;
}

function handleImagePaste(e) {
    const pngBuffer = ipcRenderer.sendSync('get-clipboard-image');

    if (pngBuffer) {
        let filePath = `./${new Date().getTime()}.png`

        let bufferStream = fs.createWriteStream(filePath);
        bufferStream.end(Buffer.from(pngBuffer.data));

        bufferStream.on('finish', () => {
            session.sendImage(mainRoom, fs.createReadStream(filePath))
            .then(() => fs.unlink(filePath));
        });
    }
}

function body_handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    uploadImage(e.dataTransfer.files[0].path);
}

function openUploadDialog(event) {
    dialog.showOpenDialog(
        remote.getCurrentWindow(),
        {
            filters: [{name: '이미지', extensions: ['jpg', 'png', 'gif']}],
            properties: ['openFile']
        },
        fileNames => {
            if(fileNames === undefined) return;
            fileNames.every(path => uploadImage(path))
        }
        );
}

function uploadImage(filePath) {
    let isImage = false;

    readChunk(filePath, 0, 4100)
    .then(buffer => {
        const type = fileType(buffer);

        if (type.mime.startsWith('image')) {
            session.sendImage(mainRoom, fs.createReadStream(filePath));
        }
    });
}