# ncc-desktop-prototype

[node-ncc-es6](https://github.com/yoo2001818/node-ncc-es6)와 [electron](https://github.com/electron/electron)으로 만든 무진장 느린 네이버 카페 채팅 데스크탑 클라이언트 프로토타입입니다.

## 스크립트
- `npm run package`: Windows, Linux 64비트용 바이너리를 패키징합니다. 패키징 한 후 settings_empty 폴더를 각각의 디렉토리에 넣는 `copy_settings` 스크립트를 실행합니다.
- `npm run package-win`: `npm run package`와 동일하지만 Windows 64비트용 바이너리만 패키징합니다.
- `npm run package-linux`: `npm run package`와 동일하지만 Linux 64비트용 바이너리만 패키징합니다.
- `npm run run`: 패키징하지 않고 `electron-prebuilt` 패키지를 사용하여 바로 실행합니다.

## 사용법
0. `npm install`
1. `npm run package-[os]` 명령어로 패키징합니다.
2. 패키징된 디렉토리의 `settings/user.json` 파일에 아이디와 비밀번호를 평문으로 집어넣습니다. ~~제가 쓰려고 만든거라 귀찮았습니다.~~
3. 패키징된 디렉토리의 `settings/chat.config.json` 파일에 다음 정보를 집어넣습니다. [예시](https://gist.github.com/lucidfext/9b9176e18a6bc8c0a6b6d3da6209e598)
    - `string` **cafeId**: 연결할 네이버 카페의 id입니다.
    - `string` **roomId**: 연결할 채팅방의 id입니다.
    - `string` **skin**: `dark`와 `light`중 하나 - css폴더에서 동일한 이름의 css파일을 불러옵니다. css파일만 있다면 마음대로 수정하셔도 됩니다.
    - `array` **initialMessages**:채팅방에 접속하면 기본적으로 불러올 메시지 수입니다. 100이 최대입니다.
    - `array` **notifyRegExps**: 알림을 받을 메시지(정규표현식)입니다.
    - `object` **ignore**: 아직 다 구현하지는 않았습니다.
        - `array` **users**: 무시할 사용자의 아이디를 입력합니다.
4. 실행파일을 실행합니다.
5. 느려질때마다 F5를 눌러줍니다.

## 감사의 말
만들고 버그를 잡는데 많은 도움을 주신 [네이버 카페 샌드박스](http://cafe.naver.com/sdbx) 회원 여러분께 감사드립니다.

## 라이센스
MIT. LICENSE 파일 참조