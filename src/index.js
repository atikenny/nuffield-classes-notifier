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
    },
    classesPage: {
        classTitle: '.day-spacer'
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
        user,
        finishedSelector: selectors.mainPage.classesButton
    });
    await log('logged in');

    // NAVIGATE TO CLASSES
    await navigateToClasses({
        page,
        mainPageSelectors: selectors.mainPage,
        finishedSelector: selectors.classesPage.classTitle
    });
    await log('navigated to classes');

    // COLLECT CLASSES
    await collectClasses({
        page,
        classesPageSelectors: selectors.classesPage
    });
    await log('collected classes');

    if (production) {
        await browser.close();
    }
})(config, selectors);

async function login({
    page,
    navigateToPage,
    loginPage,
    loginPageSelectors,
    user,
    finishedSelector
}) {
    await navigateToPage(loginPage);
    await page.type(loginPageSelectors.username, user.name);
    await page.type(loginPageSelectors.password, user.password);

    return Promise.all([
        await page.click(loginPageSelectors.submitButton),
        await page.waitForSelector(finishedSelector)
    ]);
}

async function navigateToClasses({ page, mainPageSelectors, finishedSelector }) {
    await Promise.all([
        await page.click(mainPageSelectors.classesButton),
        await page.waitForSelector(finishedSelector)
    ]);
}

async function collectClasses({ page, classesPageSelectors }) {
    const titles = await page.$$eval(classesPageSelectors.classTitle, classTitleNodes => {
        return classTitleNodes.map(classTitle => classTitle.innerText);
    });

    console.log(titles);
}
