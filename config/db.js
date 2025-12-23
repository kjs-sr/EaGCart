// config/db.js
const oracledb = require("oracledb");

// 💡 DB 접속 정보와 풀(Pool) 설정을 정의합니다.
const dbConfig = {
  user: "userid", // 오라클 사용자명
  password: "password", // 비밀번호
  connectString: "127.0.0.1:1521/ORCL", // 호스트:포트/서비스이름 (혹은 TNS 별칭)
  poolMin: 10, // 풀에 유지할 최소 연결 수
  poolMax: 10, // 풀에 가질 최대 연결 수
  poolIncrement: 0, // 연결이 부족할 때 몇 개씩 늘릴지 (0은 고정 크기 풀)
  poolAlias: "defaultPool", // 풀에 별칭 부여
};

let pool; // 커넥션 풀 객체

// 커넥션 풀을 생성하고 초기화하는 함수
async function initialize() {
  try {
    // 💡 oracledb를 Thin 모드로 사용하는 경우
    // await oracledb.initOracleClient({libDir: 'C:/oracle/instantclient'});

    // DB 연결 풀 생성
    pool = await oracledb.createPool(dbConfig);
    console.log("Oracle Connection Pool initialized successfully.");
  } catch (err) {
    console.error("Error initializing Oracle Connection Pool:", err);
    throw err;
  }
}

// 풀에서 연결을 얻어오는 함수 (Controller에서 사용됨)
function getConnection() {
  // pool.getConnection()을 통해 풀에 있는 연결을 가져와 사용
  return pool.getConnection();
}

// 풀을 종료하는 함수 (서버 종료 시 사용)
function close() {
  if (pool) {
    return pool.close();
  }
}

module.exports = {
  initialize,
  getConnection,
  close,
};
