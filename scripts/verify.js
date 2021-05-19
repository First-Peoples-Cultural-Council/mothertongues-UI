const fs = require('fs')
const safeEval = require('safe-eval')
const path = require('path');
const https = require('https')
const async = require('async');

var dictCachedPath = path.join(__dirname, '..', 'src', 'assets', 'js', 'dict_cached.js');

const MS_TO_PAUSE_BETWEEN_QUEUE = 3000;
const ENTRIES_TO_PROCESS_PER_BATCH = 100;
const FREQUENCY_TO_REPORT_PROCESSED_AUDIO = 500;

/**
 * `dict_cached` contains a "global" JS variable called dataDict
 * We need to load that file, and safe-eval it to access that variable
 * This would avoid refactoring dict_cached to using module exports, or better yet keeping it as JSON
 */
fs.readFile(dictCachedPath, 'utf8', (err, data) => {
    if (err) {
        console.error(err)
        return
    }

    var jsTree = safeEval(data.replace('var dataDict = ', ''));
    var totalResults = jsTree.length;

    console.log(`Total entries found: ${totalResults}`);

    var batch = 0;
    var completed_requests = 0;

    let processBatches = setInterval(() => {
        console.log(`Queuing records ${batch} - ${(batch + ENTRIES_TO_PROCESS_PER_BATCH)}`);

        jsTree.slice(batch, batch + ENTRIES_TO_PROCESS_PER_BATCH).forEach((entry, i) => {
            // if (entry.img != null && entry.img.toString() === "NaN") {
            //     // Check if image is defined as NaN
            //     //console.log(`Error for ${entry.entryID}: NaN defined as img instead of empty/null.`);
            // }

            // if ((entry.theme != null && entry.theme.toString() === "NaN") ||
            //     (entry.secondary_theme != null && entry.secondary_theme.toString())) {
            //     // Check if image is defined as NaN
            //     //console.log(`Error for ${entry.entryID}: NaN defined as theme or secondary theme instead of empty/null.`);
            // }

            if (entry.audio != null && entry.audio.length > 0) {
                entry.audio.forEach((audioFile) => {
                    // Make HEAD request to ensure file exists
                    https.request(audioFile.filename, { method: 'HEAD' }, (res) => {
                        if (res.statusCode != "200") {
                            console.log(`Error for ${entry.entryID}: audio filename ${audioFile.filename} is missing (${res.statusCode}).`);
                        }

                        if (completed_requests != 0 && completed_requests % FREQUENCY_TO_REPORT_PROCESSED_AUDIO === 0) {
                            // Give an indication of how many requests have been completed
                            console.log(`************`);
                            console.log(`Completed ${completed_requests} validation requests`);
                            console.log(`************`);
                        }

                        completed_requests++;
                    }).on('error', (err) => {
                        console.log(`Error for ${entry.entryID} (${err})`);
                        completed_requests++;
                    }).end();
                });
            }
        });

        batch = batch + ENTRIES_TO_PROCESS_PER_BATCH;

        if (batch > totalResults) {
            console.log(`************`);
            console.log(`Queuing all iterations complete.`);
            console.log(`************`);
            clearInterval(processBatches);
        }

    }, MS_TO_PAUSE_BETWEEN_QUEUE);
})