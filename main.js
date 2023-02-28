// Create constants
const Dropbox = require('dropbox').Dropbox;
const https = require('https');
const moment = require('moment');
const path = require('path');
const process = require('process');

// Set app key, app secret, and refresh token
const appKey = process.env.DROPBOX_APP_KEY;
const appSecret = process.env.DROPBOX_APP_SECRET;
const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

// Set the Dropbox API endpoints
const AUTH_ENDPOINT = "https://api.dropbox.com/oauth2/token";

// Set the parameters for the OAuth 2.0 flow
const params = new URLSearchParams();
params.append("grant_type", "refresh_token");
params.append("refresh_token", refreshToken);
params.append("client_id", appKey);
params.append("client_secret", appSecret);

// POST request to Dropbox for new access token
fetch(AUTH_ENDPOINT, {
    method: "POST",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
})
.then(response => {
    if (!response.ok) {
        throw new Error("Error: " + response.status + " " + response.statusText);
    }
    return response.json();
})
.then(data => {
    if (data.access_token) {
        console.log("New access token: " + data.access_token);
    } else {
        throw new Error("Error: missing access_token in response");
    }
})
.catch(error => {
    console.error("Error getting new access token from Dropbox: " + error);
});

// Get NYT Crossword
function getNYTC(date) {
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

// Download and then upload to Dropbox if not already uploaded
async function nytc(date) {
  console.log(`Checking ${moment(date).format('YYYY-MM-DD')}'s crossword.`);
  try {
    await getNYTC(date);
    console.log(`Successfully checked ${moment(date).format('YYYY-MM-DD')}'s crossword.`);
  } catch (error) {
    console.log(`NYT_COOKIE likely expired. Error: ${error}`);
    process.exit(1);
  }
  date.setDate(date.getDate());
  console.log(`Downloading ${moment(date).format('YYYY-MM-DD')}'s crossword.`);
  data = undefined;
  try {
    data = await getNYTC(date);
    console.log(`Successfully downloaded ${moment(date).format('YYYY-MM-DD')}'s crossword.`);
  } catch (error) {
    console.log(`${moment(date).format('YYYY-MM-DD')}'s crossword is not yet released.`);
    return;
  }
  console.log(`Checking if file exists.`);
  try {
    await dbx.filesGetMetadata({
      path: path.join(process.env.DROPBOX_NYTC_PATH, `${moment(date).format('YYYY-MM-DD-ddd')}-crossword.pdf`),
    });
    console.log(`File already uploaded.`);
    return;
  } catch (error) {
    console.log(`File not yet uploaded.`);
  }
  console.log(`Uploading file.`);
  try {
    response = await dbx.filesUpload({
      path: path.join(process.env.DROPBOX_NYTC_PATH, `${moment(date).format('YYYY-MM-DD-ddd')}-crossword.pdf`),
      contents: data,
    });
    console.log(`Successfully uploaded ${response.result.content_hash}.`);
    return;
  } catch (error) {
    console.log(`DROPBOX_ACCESS_TOKEN likely expired. Error: ${error}`);
    process.exit(1);
  }
}

// Get WSJ Crossword
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

// Download and then upload to dropbox if not already uploaded
async function wsjc(date) {
  date.setDate(date.getDate());
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
  console.log(`NYTC Block`);
  await nytc(new Date(date.getTime()));
  console.log(`WSJC Block`);
  await wsjc(new Date(date.getTime()));
}

main().then(() => process.exit(0));
