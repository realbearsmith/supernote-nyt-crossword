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

async function main() {
  const date = new Date((new Date()).toLocaleString('en-US', { timeZone: 'America/New_York' }));

  let isUploaded = await IsUploadedToDropbox(date);

  if(!isUploaded) {
    let cw = await DownloadCrossword(getNYTC, date)
    await UploadCrossword(cw, date)
  }

  return;
}


main().then(() => process.exit(0));
