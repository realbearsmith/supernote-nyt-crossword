const dropbox = require('dropbox');
const https = require('https');
const moment = require('moment');
const path = require('path');
const process = require('process');
require('dotenv').config()

const dbx = new dropbox.Dropbox({
  clientId: process.env.DROPBOX_APP_KEY,
  clientSecret: process.env.DROPBOX_APP_SECRET,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
});

function getNYTC(date) {

  console.log(`Checking ${moment(date).format('YYYY-MM-DD')}'s NYT crossword.`);

  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:',
      host: 'www.nytimes.com',
      path: `/svc/crosswords/v2/puzzle/print/${moment(date).format('MMMDDYY')}.pdf`,
      method: 'GET',
      headers: {
        Referer: 'https://www.nytimes.com/crosswords/archive/daily',
        Cookie: process.env.NYT_COOKIE,
      },
    }, (res) => {
      if (res.statusCode === 200) {
        const data = [];
        res.on('error', (err) => {
          reject(err);
        });
        res.on('data', (chunk) => {
          data.push(chunk);
        });
        res.on('end', () => {
          console.log(`Downloaded ${moment(date).format('YYYY-MM-DD')}'s NYT crossword.`);
          resolve(Buffer.concat(data));
        });
      } else {
        reject(res.statusCode);
      }
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });
}

async function UploadCrossword(data, date) {
  console.log(date)
  try {
    let {result} = await dbx.filesUpload({
      path: path.join(process.env.DROPBOX_NYTC_PATH, `${moment(date).format('YYYY-MM-DD-ddd')}-crossword.pdf`),
      contents: data,
    });
    console.log(`Successfully uploaded ${result.content_hash}.`);

    return result.content_hash
  }
  catch(e) {
    console.log(`DROPBOX TOKEN likely expired. Error: ${e}`);
    process.exit(1);
  }
}

async function IsUploadedToDropbox(date) {

  try {
    await dbx.filesGetMetadata({
      path: path.join(process.env.DROPBOX_NYTC_PATH, `${moment(date).format('YYYY-MM-DD-ddd')}-crossword.pdf`),
    });
    return true
  }
  catch(e) {
    console.error(e)
    return false;
  }
}

async function DownloadCrossword(api, date) {
  return api(date)
}

function getWSJC(date) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:',
      host: 's.wsj.net',
      path: `/public/resources/documents/${moment(date).format('[XWD]MMDDYYYY')}.pdf`,
      method: 'GET',
    }, (res) => {
      if (res.statusCode === 200) {
        const data = [];
        res.on('error', (err) => {
          reject(err);
        });
        res.on('data', (chunk) => {
          data.push(chunk);
        });
        res.on('end', () => {
          resolve(Buffer.concat(data));
        });
      } else {
        reject(res.statusCode);
      }
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });
}

async function wsjc(date) {
  date.setDate(date.getDate() + 1);
  console.log(`Downloading ${moment(date).format('YYYY-MM-DD')}'s crossword.`);
  data = undefined;
  try {
    data = await getWSJC(date);
    console.log(`Successfully downloaded ${moment(date).format('YYYY-MM-DD')}'s crossword.`);
  } catch (error) {
    console.log(`${moment(date).format('YYYY-MM-DD')}'s crossword is not yet released.`);
    return;
  }
  console.log(`Checking if file exists.`);
  try {
    await dbx.filesGetMetadata({
      path: path.join(process.env.DROPBOX_WSJC_PATH, `${moment(date).format('YYYY-MM-DD-ddd')}-crossword.pdf`),
    });
    console.log(`File already uploaded.`);
    return;
  } catch (error) {
    console.log(`File not yet uploaded.`);
  }
  console.log(`Uploading file.`);
  try {
    response = await dbx.filesUpload({
      path: path.join(process.env.DROPBOX_WSJC_PATH, `${moment(date).format('YYYY-MM-DD-ddd')}-crossword.pdf`),
      contents: data,
    });
    console.log(`Successfully uploaded ${response.result.content_hash}.`);
    return;
  } catch (error) {
    console.log(`DROPBOX_ACCESS_TOKEN likely expired. Error: ${error}`);
    process.exit(1);
  }
}

async function main() {
  const date = new Date((new Date()).toLocaleString('en-US', { timeZone: 'America/New_York' }));

  let isUploaded = await IsUploadedToDropbox(date);

  if(!isUploaded) {
    let cw = await DownloadCrossword(getNYTC, date)
    await UploadCrossword(cw, date)
  }
  
  await wsjc(new Date(date.getTime()));

  return;
}


main().then(() => process.exit(0));
