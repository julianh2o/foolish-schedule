import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from "fs";
import { DateTime, Interval } from "luxon";
import _ from "lodash";
import p from "p-iteration";
import nodeHtmlToImage from "node-html-to-image";
import font2base64 from "node-font2base64";

//TODO
//make single events in a slot cover the entire time even if they're short
// combine thursday, sunday, and ongoing all into the same image
// add image download links
// add QR code to print versions ?

const GENERATE_IMAGES = true;

const typeColors = {
    'Logistics': 'bg-gray-100',
    'Food': 'bg-yellow-100',
    'Social': 'bg-blue-100',
    'Nature': 'bg-green-100',
    'Movement': 'bg-purple-100',
    'Workshop': 'bg-orange-100',
    'Music': 'bg-indigo-100',
    'Performance': 'bg-red-100',
    'Ritual': 'bg-teal-100',
    'Activity': 'bg-blue-50',
    'Jam': 'bg-pink-100',
}

const SPREADSHEET_ID = "1Srx_fvxps-QCudCTm-nytppIux-kiO28bLT7Vu0KuEU";

async function fetchSheet(spreadsheetId, sheetName) {
    const cache = `./dist/${spreadsheetId}_${sheetName}.json`;
    if (await fs.existsSync(cache)) return JSON.parse(await fs.promises.readFile(cache,"utf-8"));

    const creds = JSON.parse(await fs.promises.readFile("./gservices.json", "utf-8"));

    const serviceAccountAuth = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
        ],
    })

    const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    const rows = await sheet.getRows();
    const res = rows.map((r) => r.toObject());
    await fs.promises.writeFile(cache,JSON.stringify(res,undefined,2));
    return res;
}

const generateTimes = (start, hours) => {
    const dt = DateTime.now().startOf("day").set({ hour: start });
    return _.map(_.range(0, hours), hr => ({
        interval: Interval.fromDateTimes(dt.plus({ hours: hr }), dt.plus({ hours: hr + 1 })),
        label: dt.plus({ hours: hr }).toFormat("t")
    }));
}

const processTime = (time) => {
    if (!time) return time;
    let t = DateTime.fromFormat(time, "h:mm a");
    if (t.hour < 6) t = t.plus({ hours: 24 })
    return t;
}

const processSchedule = (item, dayName) => {
    if ((item["Notes"] || "").includes("HIDE_FROM_SCHEDULE")) return null;
    const out = {
        name: item["Name"],
        day: dayName,
        type: item["Type"],
        host: item["Who"],
        description: item["Description"],
        notes: item["Notes"],
        startTime: processTime(item["Time start"]),
        endTime: processTime(item["Time end"]),
        ppc: item["Potentially Provocative Content? (PPC)"] === "Y",
        location: item["Location"],
        class: "",
    };
    const isLong = ((out.name || "").length + (out.host || "").length) > 50;
    out.class += isLong ? "text-xs" : "leading-tight text-sm";
    return out;
}

const dataForDay = async (dayName) => {
    return _.compact(_.map(await fetchSheet(SPREADSHEET_ID, dayName), (entry) => processSchedule(entry, dayName)));
}

async function generateDay(day) {
    const dayData = await dataForDay(day);
    const dayDataByLocation = _.groupBy(dayData, "location");
    const locations = Object.keys(dayDataByLocation);
    const columns = _.map(locations, loc => ({
        name: loc,
        data: dayDataByLocation[loc],
    }));
    return columns;
}

async function main() {
    const dayNames = ["Thursday", "Friday", "Saturday", "Sunday"];
    // const allDays = _.flatten(await p.mapSeries(["Thursday", "Friday", "Saturday", "Sunday"], async (day) => await dataForDay(day)));
    // const types = _.uniq(_.map(allDays, "type"));

    console.log("Fetching data...");
    const days = await p.mapSeries(dayNames, async (day) => ({
        title: day,
        columns: await generateDay(day),
    }));

    const ongoingTab = await generateDay("Ongoing");
    const ongoing = _.flatten(_.map(ongoingTab,"data"));

    const emojiFont = font2base64.encodeToDataUrlSync('./NotoColorEmoji.ttf');

    const times = generateTimes(8, 20);
    const css = await fs.promises.readFile("./dist/output.css");
    const emojiFontCss = `@font-face { font-family: 'emoji'; src: url(${emojiFont}) format('woff2'); }`;
    const forPrintCss = `${emojiFontCss}\nbody { width: 2400px; height: 1800px; }`;

    const templateHtml = await fs.promises.readFile("./schedule.html", "utf-8");
    const context = {
        typeColors,
        times,
        days,
        ongoing,
        css
    };
    console.log("Generating Web...");
    await fs.promises.writeFile("./dist/tmp.json", JSON.stringify(context, undefined, 2));
    const webHtml = _.template(templateHtml)(context);
    await fs.promises.writeFile("./dist/out.html", webHtml);

    if (!GENERATE_IMAGES) return;
    console.log("Generate Images..");
    for (const day of days) {
        const printHtml = _.template(templateHtml)({
            ...context,
            css: `${context.css}\n${forPrintCss}`,
            days: [day],
        });
        await nodeHtmlToImage({
            output: `./dist/${day.title}.png`,
            html: printHtml
        });
    }
}



main()