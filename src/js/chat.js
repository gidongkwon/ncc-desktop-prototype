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
const consts = require('./consts');
const utils = require('./utils');
const HTML = utils.HTML;

const notifyRegExps = config.notifyRegExps.map(value => new RegExp(value, 'gim'));


const input = document.getElementById('input');
const chatContainer = document.getElementById('chat-container');
const uploadImageButton = document.getElementById('upload-image');

let synced = false;
let me = null;

let credentials = new Credentials(user.id, user.password);
let session = new Session(credentials);
let currentRoom = new Room(session, config.roomId);

currentRoom.cafe = {
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
.then(() => session.syncRoom(currentRoom)) // force-sync to fetch data of myself
.then(room => {
    currentRoom = room;
    synced = true;

    remote.getCurrentWindow().setTitle(currentRoom.name);

    const lastId = currentRoom.lastMessage.id;

    return session.getMsg(currentRoom, lastId - config.initialMessages - 1, lastId);
})
.then(messages => {
    messages.map((value) => {
        value.old = true;
        receiveMessage(value);
    });

    chatContainer.scrollTop = chatContainer.scrollHeight;

    //chatContainer.addEventListener('scroll', handleChatScroll);
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
    session.getMsg(currentRoom, id - count - 1, id - 1)
        .then(messages => {
            messages.map((chatData) => {
                chatData.old = true;
                receiveMessage(chatData);
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
        session.sendText(currentRoom, message);
        input.value = '';
    }
}

// sdbx cafe specific.
function removeKkirobot(chatData) {
    if (chatData.user.id === 'rotate13') { // handle irc, discord bot
        const found = chatData.message.match(consts.REGEXP_KKIROBOT_MESSAGE);

        if (found) {
            chatData.user.nickname = found[1];
            chatData.message = found[2];
        }
    }
}

function isNormalMessage(chatData) {
    return chatData.type === 'text' ||chatData.type === 'image' || chatData.type === 'sticker';
}

function createChatElement(chatData) {
    const el = document.createElement('div');
    el.setAttribute('message-id', chatData.id);

    el.classList.add('chat-item');

    const nicknameDiv = chatContainer.lastChild ? chatContainer.lastChild.getElementsByClassName('nickname')[0] : null;

    if (isNormalMessage(chatData)) {
        if (nicknameDiv &&
            nicknameDiv.getAttribute('user-id') === chatData.user.id &&
            nicknameDiv.firstChild.textContent === chatData.user.nickname) {
            el.classList.add('same-sender');
        }
    } else {
        el.classList.add('highlight');
    }
       
    if (sentFromMe(chatData))
        el.classList.add('me');

    return el;
}

function processChatToHTML(chatData, haveToScroll) {
    const id = chatData.user.id;
    const profileImageURL = chatData.user.image;
    const nickname = chatData.user.nickname;

    let message = chatData.message;
    chatData.old = chatData.old || false;

    let html = HTML`<div class='profile-picture' style='background-image: url(${profileImageURL})'></div>
                       <div class='nickname' user-id='${id}' title='${nickname} (${id})'><span>${nickname}</span></div>
                       <span class='colon'>:</span>`;

    let thumbElement = null;

    switch (chatData.type) {
        case 'join':
            html = HTML`<div class='notification'>${nickname}님이 접속하셨습니다</div>`;
            break;

        case 'leave':
            html = HTML`<div class='notification'>${nickname}님이 퇴장하셨습니다</div>`;
            break;

        case 'changeName':
            const roomName = chatData.target;

            const hasJongseong = ((roomName.charCodeAt(roomName.length - 1)-0xAC00)%28) !== 0;

            html = HTML`<div class='notification'>방 이름이 ${roomName}${hasJongseong?'으':''}로 변경되었습니다</div>`;
            remote.getCurrentWindow().setTitle(currentRoom.name);
            break;
            
        case 'text':            
            let messageEncodedWithLink = utils.escapeHTML(message).replace(consts.REGEXP_URL, '<a href="$1" target="_blank">$1</a>');
            html += `<div class='message'>${messageEncodedWithLink}\n</div>`
            break;

        case 'image':
            const imageURLEncoded = encodeURI(chatData.image);

            let thumbURLEncoded = null;

            html += HTML`<a href='${consts.IMAGE_VIEWER_URL}?src=${imageURLEncoded}' target='_blank'>`;

            if (chatData.thumb === undefined) {
                thumbURLEncoded = chatData.image + '?type=w128'
            } else {
                thumbURLEncoded = utils.escapeHTML(chatData.thumb);
            }

            thumbElement = new Image();
            thumbElement.src = thumbURLEncoded;
            thumbElement.className = 'thumbnail';
            if (haveToScroll)
                thumbElement.addEventListener('load', handleImageScroll);

            html += thumbElement.outerHTML + '</a>'
            break;

        case 'sticker':
            thumbElement = new Image();
            thumbElement.src = chatData.image;
            thumbElement.className = 'sticker';
            if (haveToScroll)
                thumbElement.addEventListener('load', handleImageScroll);

            html += thumbElement.outerHTML;
            break;
    }

    return html;
}

function isGoodToIgnore(chatData) {
    return (config.ignore && config.ignore.users && config.ignore.users.some(value => value === chatData.user.id));
}

function sentFromMe(chatData) {
    return session.username === chatData.user.id;
}

function receiveMessage(chatData) {
    if (chatData.room.id !== currentRoom.id || isGoodToIgnore(chatData))
        return;

    const haveToScroll = utils.isScrollOnBottom(chatContainer);
    
    // sdbx cafe specific. please remove this line in general use.
    removeKkirobot(chatData);

    const chatElement = createChatElement(chatData);
    chatElement.innerHTML = processChatToHTML(chatData, haveToScroll);        
    chatContainer.appendChild(chatElement);
    
    if (haveToScroll)
        chatContainer.scrollTop = chatContainer.scrollHeight;

    if (!remote.getCurrentWindow().isFocused())
        remote.getCurrentWindow().flashFrame(true);
}

function handleChatScroll(e) {
    if (chatContainer.scrollTop === 0) {
        getPrevMessages(currentRoom, 100, chatContainer.firstChild.getAttribute('message-id'));
    }
}

function handleImageScroll(e) {
    chatContainer.scrollTop += e.target.height;
}

function handleImagePaste(e) {
    const pngBuffer = ipcRenderer.sendSync('get-clipboard-image');

    if (pngBuffer) {
        let filePath = `./${Date.now()}.png`

        let bufferStream = fs.createWriteStream(filePath);
        bufferStream.end(Buffer.from(pngBuffer.data));

        bufferStream.on('finish', () => {
            session.sendImage(currentRoom, fs.createReadStream(filePath))
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
            session.sendImage(currentRoom, fs.createReadStream(filePath));
        }
    });
}