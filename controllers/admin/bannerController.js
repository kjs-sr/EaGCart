const bannerModel = require("../../models/bannerModel");
const fs = require("fs");
const path = require("path");

// [Helper] 폴더 비우기 함수
const clearFolder = (folderPath) => {
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      fs.unlinkSync(path.join(folderPath, file));
    }
  }
};

// 1. 배너 관리 페이지 렌더링 (접속 시 뒷정리 수행)
const getBannerManagePage = async (req, res) => {
  try {
    // 1) 페이지 접속 시 임시 폴더(temp) 비우기 (청소)
    const tempDir = path.join(
      __dirname,
      "..",
      "..",
      "public",
      "images",
      "temp"
    );
    try {
      clearFolder(tempDir);
    } catch (e) {
      console.error("Failed to clear temp folder:", e.message);
    }

    // 2) DB 목록 로드
    const banners = await bannerModel.getBanners();
    res.render("admin/banner_manage", { banners: banners, active: "banner" });
  } catch (err) {
    console.error("Failed to load banners:", err);
    res.render("admin/banner_manage", { banners: [], active: "banner" });
  }
};

// 2. 임시 업로드 (AJAX용, DB 저장 안 함)
const uploadBannerTemp = (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }
  // 임시 경로 반환 (/images/temp/파일.jpg)
  const tempPath = `/images/temp/${req.file.filename}`;
  res.json({ success: true, imagePath: tempPath });
};

// 3. 최종 저장 (핵심 로직: 파일 이동 + DB 일괄 교체)
const saveAllBanners = async (req, res) => {
  // 프론트엔드에서 보낸 배너 배열 (순서대로 옴)
  // 예: [{ imagePath: '/images/temp/a.jpg', linkType: 'URL', linkContent: '...' }, ...]
  const newBannerList = req.body.banners || [];

  const publicDir = path.join(__dirname, "..", "..", "public");
  const bannerDir = path.join(publicDir, "images", "banner");

  // 최종 DB에 저장될 데이터 리스트
  const dbDataList = [];
  // 이번에 저장되어 살아남을 실제 파일명 리스트 (고아 파일 삭제용)
  const survivedFileNames = new Set();

  try {
    // === 1단계: 파일 처리 (Temp -> Banner 이동) ===
    for (let i = 0; i < newBannerList.length; i++) {
      const banner = newBannerList[i];
      let finalPath = banner.imagePath;

      // 1-1. 임시 파일인지 확인 (/images/temp/ 로 시작하는지)
      if (finalPath.startsWith("/images/temp/")) {
        const tempFileName = path.basename(finalPath);
        const sourcePath = path.join(publicDir, finalPath); // .../public/images/temp/a.jpg

        // 이동할 목적지 경로 (파일명은 그대로 쓰거나, 충돌 방지를 위해 새로 지을 수도 있음)
        // 여기서는 편의상 temp 접두어만 떼고 이동
        const newFileName = tempFileName.replace("temp-", "banner-");
        const destPath = path.join(bannerDir, newFileName);

        // 파일 이동 (Move)
        if (fs.existsSync(sourcePath)) {
          fs.renameSync(sourcePath, destPath);
          finalPath = `/images/banner/${newFileName}`; // 경로 갱신
        }
      }

      // 1-2. 살아남은 파일명 기록 (경로에서 파일명만 추출)
      survivedFileNames.add(path.basename(finalPath));

      // 1-3. DB 데이터 준비 (번호는 1부터 순차 부여)
      dbDataList.push({
        num: i + 1, // PK (1, 2, 3...)
        imagePath: finalPath,
        linkType: banner.linkType,
        linkContent: banner.linkContent,
        order: i + 1,
      });
    }

    // === 2단계: DB 트랜잭션 (삭제 후 삽입) ===
    await bannerModel.replaceAllBanners(dbDataList);

    // === 3단계: 고아 파일 삭제 (Garbage Collection) ===
    // /images/banner 폴더에 있지만, 이번 DB 저장 목록(survivedFileNames)에는 없는 파일 삭제
    if (fs.existsSync(bannerDir)) {
      const allFiles = fs.readdirSync(bannerDir);
      for (const file of allFiles) {
        // 이미지가 아닌 시스템 파일 등은 건너뛰기 로직 추가 가능
        if (!survivedFileNames.has(file)) {
          const filePath = path.join(bannerDir, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`[Cleaner] Deleted orphan file: ${file}`);
          } catch (e) {
            console.error(`[Cleaner] Failed to delete: ${file}`);
          }
        }
      }
    }

    // === 4단계: 임시 폴더 비우기 (성공 시 깔끔하게) ===
    const tempDir = path.join(publicDir, "images", "temp");
    clearFolder(tempDir);

    res.json({ success: true });
  } catch (err) {
    console.error("Save All Error:", err);
    res
      .status(500)
      .json({ success: false, message: "저장 중 오류가 발생했습니다." });
  }
};

module.exports = {
  getBannerManagePage,
  uploadBannerTemp,
  saveAllBanners,
};
