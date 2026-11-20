# 로스트아크 Discord Bot

로스트아크 정보 조회, 시세 확인, 일정 알림과 파티 모집을 지원하는 Discord 봇입니다.
Node.js와 discord.js로 실행하며, 캐릭터 정보와 일정을 이미지로 보여줍니다.

이 저장소를 내려받은 뒤 **본인의 Discord 봇 토큰과 로스트아크 API 키**를 설정해 사용합니다.
봇이 응답하려면 PC 또는 서버에서 실행 프로세스가 켜져 있어야 합니다.

## 주요 기능

- **캐릭터 정보**: 장비, 악세서리, 각인, 보석, 카드 정보를 이미지로 조회
- **시세·경매**: 각인서·보석·젬·악세서리 시세 조회와 경매 분배금 계산
- **일정·알림**: 일정 이미지 조회, 카오스게이트·필드보스·골드 모험섬 알림과 개인별 구독
- **파티 모집**: 모집글 생성, 버튼으로 참가·탈퇴, 모집 현황 확인

## 실행 전 준비

| 준비물 | 설명 |
| --- | --- |
| [Node.js](https://nodejs.org/en/download)와 npm | 현재 지원되는 LTS 버전 권장. 이미지 처리 라이브러리 `sharp` 때문에 최소 Node.js 20.9.0 필요 |
| [Git](https://git-scm.com/downloads) | 저장소를 내려받을 때 사용 |
| Discord 계정과 서버 | 봇을 초대할 수 있는 서버 권한 필요 |
| Discord 애플리케이션 | 아래 절차에서 봇 토큰과 Application ID 발급 |
| 로스트아크 Open API 키 | 게임 정보·시세·일정 알림 사용 시 필요 |

터미널에서 설치 여부를 확인합니다.

```bash
node --version
npm --version
git --version
```

## 설치와 첫 실행

### 1. 코드 내려받기

```bash
git clone https://github.com/MONBRUNO/discord-bot.git
cd discord-bot
npm ci
```

이후 터미널 명령은 모두 `package.json`이 있는 프로젝트 폴더에서 실행합니다.

### 2. Discord 봇 만들기와 초대

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 **New Application**으로 애플리케이션을 만듭니다.
2. **General Information → Application ID**를 복사합니다. `.env`의 `DISCORD_CLIENT_ID`에 넣을 값입니다.
3. **Bot** 페이지에서 봇 토큰을 발급받습니다. 토큰이 표시되지 않으면 **Reset Token**으로 발급받아 `DISCORD_TOKEN`에 사용합니다. 기존에 사용하던 토큰을 재발급하면 이전 토큰은 바뀝니다.
4. 같은 페이지의 **Privileged Gateway Intents → Server Members Intent**를 켜고 저장합니다. 이 봇은 멤버 조회와 알림 역할 관리를 위해 `GuildMembers` intent를 사용합니다. [Discord intent 안내](https://docs.discord.com/developers/events/gateway#enabling-privileged-intents)
5. **Installation**에서 **Guild Install**을 활성화하고, 설치 범위에 `bot`과 `applications.commands`를 추가합니다.
6. 아래 권한을 설정한 뒤 설치 링크를 열어 **서버에 추가**합니다. [Discord 설치 안내](https://docs.discord.com/developers/quick-start/getting-started#adding-scopes-and-bot-permissions)

| 봇 권한 | 필요한 기능 |
| --- | --- |
| View Channels · Send Messages | 채널 접근과 응답·모집글·알림 전송 |
| Embed Links · Attach Files | 정보 임베드와 캐릭터·일정 이미지 전송 |
| Read Message History | 기존 파티 모집글을 찾아 갱신 |
| Manage Roles | 알림 역할 생성과 구독자 역할 부여·해제 |
| Mention @everyone, @here, and All Roles | 멘션이 허용되지 않은 알림 역할에도 알림 전송. 해당 역할을 멘션 가능하게 설정한 경우에는 생략 가능 |
| Manage Channels — 선택 | 새 서버에서 알림 채널을 자동 생성할 때 사용 |

**서버 설정 → 역할**에서 봇의 역할을 알림 역할보다 위에 배치합니다.
채널별 권한 설정에서도 봇의 접근과 메시지·파일 전송이 허용되어 있어야 합니다.

### 3. 환경변수 설정

`.env.example`을 복사해 `.env`를 만듭니다. 이미 `.env`가 있다면 기존 파일을 수정합니다.

macOS / Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

텍스트 편집기로 `.env`를 열고 아래 값을 입력합니다.

```dotenv
DISCORD_TOKEN=발급받은_봇_토큰
DISCORD_CLIENT_ID=애플리케이션_ID
LOSTARK_API_KEY=발급받은_로스트아크_API_키
```

| 환경변수 | 필수 여부 | 입력할 값 |
| --- | --- | --- |
| `DISCORD_TOKEN` | 필수 | Developer Portal의 Bot 토큰 |
| `DISCORD_CLIENT_ID` | 필수 | 같은 애플리케이션의 Application ID |
| `LOSTARK_API_KEY` | 게임 기능 사용 시 필수 | 로스트아크 Open API의 API KEY / JWT |
| `DISCORD_GUILD_ID` | 선택 | 기존 서버별 명령을 정리할 서버 ID |
| `DISCORD_GUILD_IDS` | 선택 | 여러 서버를 정리할 때 쉼표로 구분한 서버 ID. 단일 ID보다 우선 적용 |

로스트아크 키는 [공식 개발자 포털](https://developer-lostark.game.onstove.com/)에 로그인한 뒤 **MY CLIENTS**에서 클라이언트를 만들고 **API KEY**를 확인합니다. [키 발급 관련 FAQ](https://developer-lostark.game.onstove.com/faq)
이 프로젝트는 요청 시 `bearer`를 자동으로 붙이므로 키 문자열만 입력하면 됩니다.

로스트아크 키 없이도 `/ping`, `/경매`, 파티 모집을 확인할 수 있습니다.
다만 게임 조회·일정 알림은 사용할 수 없고, 백그라운드 시세 캐시에서 키 누락 오류가 기록될 수 있습니다.

토큰은 `.env`에 보관합니다. `.env`는 Git에서 제외되며, 공개 문서나 커밋에는 실제 토큰을 넣지 않습니다.

### 4. 슬래시 명령 등록

```bash
npm run register
```

성공하면 마지막에 다음 메시지가 표시됩니다.

```text
Slash commands registered.
```

명령은 **전역 명령**으로 등록되므로 봇을 초대한 서버에서 사용할 수 있습니다.
최초 설치와 명령 이름·옵션을 바꾼 뒤에 실행합니다. 평소 봇을 다시 켤 때는 재등록할 필요가 없습니다.
실행 시 해당 애플리케이션의 전역 명령 목록이 현재 코드의 목록으로 교체됩니다. [Discord 명령 등록 문서](https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-global-application-commands)

> `DISCORD_GUILD_ID` 또는 `DISCORD_GUILD_IDS`를 설정하면 해당 서버에 이 애플리케이션이 등록했던 **서버별 명령 전체를 지워** 전역 명령과의 중복을 정리합니다. 처음 설치할 때는 두 변수를 주석 상태로 두어도 됩니다. 서버별 명령 등록을 위한 설정이 아닙니다.

### 5. 봇 실행

일반 실행:

```bash
npm start
```

코드를 수정하며 개발할 때는 파일 변경 시 자동으로 재시작합니다.

```bash
npm run dev
```

로그에 `Logged in as 봇이름`이 보이면 Discord 연결이 완료된 것입니다.
Discord 서버 채널에서 `/ping`을 실행해 `Pong!` 응답을 확인합니다.
종료는 실행 중인 터미널에서 `Ctrl+C`를 누릅니다.

### 6. 일정 알림 설정 — 선택

로스트아크 API 키를 설정한 상태에서 다음 순서로 진행합니다.

1. **서버 관리 권한이 있는 멤버**가 `/알림설정 channel:#알림채널`을 실행합니다. 알림 채널을 저장하고 컨텐츠별 역할을 준비합니다.
2. `/알림켜기`로 해당 서버의 시간 알림을 활성화합니다. `/알림설정` 직후에는 알림이 꺼져 있습니다.
3. 알림을 받을 멤버가 `/알림`을 실행하고 **전체 알림 켜기** 버튼을 누릅니다. 구독한 멤버에게만 알림 역할을 부여합니다.
4. `/알림상태`로 채널·역할·활성화 여부를 확인합니다. 중지하려면 `/알림끄기`를 사용합니다.

알림 시간은 **한국 시간(Asia/Seoul)** 기준입니다.
카오스게이트·필드보스 알림과 **골드 보상이 있는 모험섬** 알림을 지원하며, 오전 04:30~07:30에는 메시지를 보내지 않습니다.
메시지의 **완료** 버튼을 누르면 해당 컨텐츠의 오늘 알림만 꺼집니다.
서버 알림과 봇이 실행 중인 경우, 오전 06:00에 구독자의 알림 역할을 복구합니다.

## 현재 등록되는 명령어

Discord 채팅창에 `/`를 입력하고 명령과 옵션을 선택합니다.
이 표는 코드의 실제 등록 목록을 기준으로 합니다. 현재 `/help` 응답에는 일부 예전 명령 안내가 남아 있습니다.

### 일반·게임·파티

| 명령어 | 기능 | 로스트아크 API 키 |
| --- | --- | --- |
| `/ping` | 봇 응답 시간 확인 | 불필요 |
| `/help` | 도움말 표시 | 불필요 |
| `/경매 gold:10000` | 4인·8인 경매 분배 입찰가 계산 | 불필요 |
| `/책값 item:원한 grade:유물` | 각인서 최저가·최근 거래가 조회. 등급 생략 시 유물 | 필요 |
| `/보석값` | 7~10레벨 겁화·작열 보석 최저가 조회 | 필요 |
| `/젬값` | 질서·혼돈의 젬 최저가 조회 | 필요 |
| `/상단일` | 고대 4티어 악세 상옵 단일 최저가 조회 | 필요 |
| `/상중90` | 품질 90 이상 고대 4티어 악세 상+중 최저가 조회 | 필요 |
| `/상상상` | 고대 4티어 악세 상옵 3개 최저가 조회 | 필요 |
| `/정보 character:캐릭터이름` | 캐릭터 정보를 이미지로 조회 | 필요 |
| `/일정` | 오늘 일정 이미지 조회. `date:YYYY-MM-DD`로 날짜 지정 가능 | 필요 |
| `/파티모집 제목:레이드모집 정원:4` | 파티장 포함 1~30명 모집글 생성 | 불필요 |
| `/파티` | 파티 모집 현황 확인 | 불필요 |

### 알림

| 명령어 | 기능 | 기본 사용자 권한 |
| --- | --- | --- |
| `/알림` | 내 구독과 오늘 컨텐츠별 알림을 버튼으로 변경 | 일반 멤버 |
| `/알림설정 channel:#알림채널` | 채널 지정과 알림 역할 준비 | 서버 관리 |
| `/알림켜기` | 서버 시간 알림 활성화 | 서버 관리 |
| `/알림끄기` | 서버 시간 알림 중지 | 서버 관리 |
| `/알림상태` | 현재 알림 설정 확인 | 서버 관리 |
| `/알림지정 멤버:@멤버 상태:켜기` | 특정 멤버의 구독 변경. 끄기도 선택 가능 | 서버 관리 |
| `/알림구독자` | 구독자와 오늘 알림을 완료한 멤버 확인 | 서버 관리 |

## 계속 실행하기와 데이터 보관

- **항상 켜진 실행 환경이 필요합니다.** PC 종료·절전 또는 실행 프로세스 종료 시 응답과 알림이 멈춥니다. GitHub는 코드를 보관하는 곳이며 봇을 자동 실행해 주지 않습니다.
- **`npm start`는 자동 재시작 서비스를 설치하지 않습니다.** 상시 운영하려면 서버에서 프로세스 관리자나 운영체제 서비스로 실행하고 재부팅 시 시작되도록 설정합니다.
- **한 번에 프로세스 하나를 실행합니다.** 같은 봇을 여러 개 띄우면 알림이 중복되거나 JSON 저장이 충돌할 수 있습니다.
- **`data/`는 실행 중 자동 생성됩니다.** `alert-configs.json`에는 서버별 알림 설정·구독 정보, `parties.json`에는 파티 정보가 저장됩니다. 서버를 옮길 때 `.env`와 `data/`를 별도로 보관합니다.
- **알림을 놓친 시간은 소급 발송하지 않습니다.** 오전 06:00에 봇이 꺼져 있거나 서버 알림이 중지돼 있으면 그날의 역할 복구도 실행되지 않습니다. 필요하면 `/알림`에서 오늘 알림을 다시 켭니다.

## 자주 막히는 부분

| 증상 | 확인할 내용 |
| --- | --- |
| `node` 또는 `npm` 명령을 찾지 못함 | Node.js 설치 후 터미널을 다시 열고 버전 확인 |
| `Missing required environment variables` | 프로젝트 폴더에 `.env`가 있는지, 토큰과 Application ID를 입력했는지 확인. Windows에서는 `.env.txt`가 되지 않도록 파일명 확인 |
| 토큰 오류 또는 `401 Unauthorized` | Discord 봇 토큰과 같은 애플리케이션의 ID인지 확인. 로스트아크 조회에서 발생하면 API 키도 확인 |
| `Used disallowed intents` 또는 연결 코드 `4014` | Developer Portal의 **Server Members Intent** 활성화 여부 확인 |
| 슬래시 명령이 보이지 않음 | `npm run register` 성공 여부, 서버 초대 여부와 `applications.commands` 범위 확인. Discord를 다시 열어 명령 목록 갱신 |
| 등록 중 `Missing Access` | 설정한 서버 ID가 맞고 그 서버에 봇이 있는지 확인. 처음 설치라면 선택 항목인 서버 ID를 주석 처리 |
| `Missing Permissions` 또는 알림 역할 부여 실패 | 봇의 역할 관리 권한·역할 순서와 대상 채널의 권한 덮어쓰기 확인 |
| 알림이 오지 않음 | `/알림설정` → `/알림켜기` → 개인 `/알림` 구독 순서, 봇 실행 상태, API 키와 휴식 시간 확인. 모험섬 알림은 골드 보상 일정만 대상 |
| 메시지는 오지만 역할 알림이 울리지 않음 | 역할 멘션 권한 또는 역할의 멘션 허용 설정, 멤버 개인의 Discord 알림 설정 확인 |
| 게임 조회가 실패하거나 `429`가 표시됨 | API 키와 [로스트아크 API 상태](https://developer-lostark.game.onstove.com/) 확인. 요청 제한이라면 잠시 후 재시도 |
| `sharp` 설치·로드 실패 또는 `EBADENGINE` | Node.js 버전·OS·CPU에 맞는 지원 환경인지 확인하고 같은 환경에서 `npm ci` 실행. `node_modules`는 다른 PC에서 복사하지 않음 |
| 이미지의 한글이 네모로 표시됨 | 실행 환경에 한글을 지원하는 글꼴 설치 후 봇 재시작 |

## 프로젝트 구조

```text
src/
  index.js               # Discord 연결과 이벤트 처리
  config.js              # 환경변수 읽기
  register-commands.js   # 전역 명령 등록과 기존 서버별 명령 정리
  commands/              # 명령 정의와 실행 처리
  services/              # API 요청, 이미지 생성, 알림·파티 처리와 저장
assets/                  # 이미지 생성에 사용하는 리소스
scripts/                 # 유지보수 스크립트
data/                    # 실행 중 생성되는 로컬 데이터 — Git 제외
.env.example             # 환경변수 설정 예시
```

새 명령은 `src/commands/index.js`에서 연결하는 명령 배열에 포함해야 등록됩니다.
명령 이름이나 옵션을 바꾸면 `npm run register`를 다시 실행하고 봇을 재시작합니다.
