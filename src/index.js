const puppeteer = require('puppeteer');
const fs = require('fs');

const production = process.env.NODE_ENV === 'production';
const password = process.argv[2];

if (!password) {
    throw new Error('Please provide password as first argument!');
}

const config = {
    screenshotsDir: 'screenshots',
    loginPage: 'https://member.nuffieldhealth.com/bookings/login.asp',
    dev: !production,
    user: {
        name: 'bartha.attila@uxp.hu',
        password
    }
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

(async function main({ screenshotsDir, loginPage, user, dev = false }) {
    const browserConfig = {
        headless: !dev,
        slowMo: dev ? 100 : 0
    };
    const browser = await puppeteer.launch(browserConfig);
    const page = await browser.newPage();
    const log = await getFlowLogger({
        screenshotsDir,
        page
    });
    const navigateToPage = getNavigator({ page, log });

    // LOGIN
    await navigateToPage(loginPage);
    await page.type('[name=emailaddress]', user.name);
    await page.type('[name=password]', user.password);

    if (production) {
        await browser.close();
    }
})(config);
