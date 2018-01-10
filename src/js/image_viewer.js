let filePath = document.location.toString().split('src=')[1];
const imageElement = document.getElementById('image');

imageElement.src = filePath;

let wGap = window.outerWidth - window.innerWidth;
let hGap = window.outerHeight - window.innerHeight;

imageElement.addEventListener('load', event => {
    const w = Math.min(Math.max(event.target.naturalWidth, 100), 1280);
    const h = Math.min(Math.max(event.target.naturalHeight, 100), 720);
    window.resizeTo(w + wGap, h + hGap);
});

imageElement.addEventListener('click', event => {
    window.close();
});