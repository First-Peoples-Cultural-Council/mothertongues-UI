const fs = require('fs');
const path = require('path');
const https = require('https');
const async = require('async');
const readline = require('readline');
const exec = require('child_process').exec;

const FIX_FILE = path.join(__dirname, '..', 'audio-fix.tmp');
const TMP_FOLDER = path.join(__dirname, '..', `tmp/`);
const FV_DOWNLOAD_URL = "https://www.firstvoices.com/nuxeo/nxfile/default/"
const S3_URL_REGEX = /(.*)(amazonaws.com\/)([^\s]*)/;
const S3_BUCKET = "s3://fv-app-data/";

/**
 * Requires that you have S3 cli configured locally
 */
function uploadToS3(file, bucketName, folder) {
    const remoteBucket = S3_BUCKET + bucketName + '/' + folder;
    const { stdout, stderr } = exec(`aws s3 cp ${TMP_FOLDER}${file} ${remoteBucket} --acl public-read`);

    if (stderr != null) {
        console.log(stderr);
    }
}

/**
 * Processes lines from an audio-fix.tmp file. This can be outputted from the `verify` process.
 * For example:
 *  Error for 27: audio filename https://S3_REMOTE/BUCKET_NAME/62/624c09e4-d4e3-4a9d-86c5-81c722caa0bb is missing (404).
 *  Error for 322: audio filename https://S3_REMOTE/BUCKET_NAME/44/443c09e4-d4e3-4a9d-86c5-81c722caa0bb is missing (404).
 */
async function processLineByLine() {
    const fileStream = fs.createReadStream(FIX_FILE);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        let lineMatch = line.match(S3_URL_REGEX);

        if (!lineMatch) {
            // Skip lines that don't have a valid S3 url
            continue;
        }

        let remotePathToFile = lineMatch[3];
        let splitRemotePathToFile = remotePathToFile.split('/');

        let bucketName = splitRemotePathToFile[0];
        let folder = `${splitRemotePathToFile[1]}/${splitRemotePathToFile[2]}`;
        let file = splitRemotePathToFile[2];

        // Download file to local folder /tmp/
        const savedFile = fs.createWriteStream(TMP_FOLDER + file);

        var request = https.get(FV_DOWNLOAD_URL + file, function (response) {
            response.pipe(savedFile);
            savedFile.on('finish', function () {
                savedFile.close();
            });
        }).on('error', function (err) {
            fs.unlink(TMP_FOLDER + file);
            console.log(err.message);
        });

        // Upload to S3
        //uploadToS3(file, bucketName, folder);
    }
}

if (fs.existsSync(TMP_FOLDER)) {
    // Remove temporary folder and contents if exists
    fs.rmdirSync(TMP_FOLDER, { recursive: true });
}

// Create new temporary directory
fs.mkdirSync(TMP_FOLDER);

processLineByLine();