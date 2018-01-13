const puppeteer = require('puppeteer');
const fs = require('fs');

const production = process.env.NODE_ENV === 'production';
const password = process.argv[2];

if (!password) {
    throw new Error('Please provide password as the first argument!');
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

const selectors = {
    loginPage: {
        username: '[name=emailaddress]',
        password: '[name=password]',
        submitButton: '#loginButton'
    },
    mainPage: {
        classesButton: '#mnu_classes'
    }
};

async function getFlowLogger({ screenshotsDir, page, fullPage = true }) {
    let step = 0;
    const flowId = Date.now();
    const flowScreenshotsDir = `./${screenshotsDir}/${flowId}`;

    if (!(await fs.exists(flowScreenshotsDir))) {
        fs.mkdir(flowScreenshotsDir);
    }

    return async function log(stepDescription) {
        console.log(`Step ${++step}: `, stepDescription);

        await page.screenshot({
            path: `${flowScreenshotsDir}/step-${step}.png`,
            fullPage
        });
    };
}

function getNavigator({ page, log }) {
    return async function navigateToPage(url) {
        await page.goto(url);
        await log(`navigated to ${url}`);
    }
}

async function login({ page, navigateToPage, loginPage, loginPageSelectors, user }) {
    await navigateToPage(loginPage);
    await page.type(loginPageSelectors.username, user.name);
    await page.type(loginPageSelectors.password, user.password);
    await page.click(loginPageSelectors.submitButton);
}

(async function main(config, selectors) {
    const { screenshotsDir, loginPage, user, dev = false } = config;
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
    await login({
        page,
        navigateToPage,
        loginPage,
        loginPageSelectors: selectors.loginPage,
        user
    });
    await log('logged in');

    // NAVIGATE TO CLASSES
    await page.click(selectors.mainPage.classesButton);
    await log('navigated to classes');

    if (production) {
        await browser.close();
    }
})(config, selectors);
