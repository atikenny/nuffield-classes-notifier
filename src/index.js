const puppeteer = require('puppeteer');
const fs = require('fs');

const config = {
    screenshotsDir: 'screenshots',
    loginPage: 'https://member.nuffieldhealth.com/bookings/login.asp'
};

async function getFlowLogger({ screenshotsDir, page, fullPage = true }) {
    let step = 0;
    const flowId = Date.now();
    const flowScreenshotsDir = `./${screenshotsDir}/${flowId}`;

    if (!(await fs.exists(flowScreenshotsDir))) {
        fs.mkdir(flowScreenshotsDir);
    }

    return async function log() {
        await page.screenshot({
            path: `${flowScreenshotsDir}/step-${++step}.png`,
            fullPage
        });
    };
}

function getNavigator({ page, log }) {
    return async function navigateToPage(url) {
        await page.goto(url);
        await log();
    }
}

(async function main({ screenshotsDir, loginPage }) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const log = await getFlowLogger({
        screenshotsDir,
        page
    });
    const navigateToPage = getNavigator({ page, log });

    // LOGIN
    await navigateToPage(loginPage);

    await browser.close();
})(config);
