const MiniSearch = require('minisearch')
const constant = require('./constant')
const { initializeApp, } = require("firebase/app")
const { getDatabase, ref, get, child, } = require('firebase/database')
const { getStorage, ref: sRef, getDownloadURL } = require('firebase/storage')
const express = require('express')
const regex = require('./regex')
const app = express()
const { writeFile, readFile, existsSync, createWriteStream } = require('fs');
const fetch = require('node-fetch')

const addDataToJSON = (docs, abbr) => {
    const documentsContent = docs.map(item => {
        item["abbr"] = abbr
        item["index"] = `${abbr} ${item["index"]}`
        return item
    })
    return documentsContent
}


// REGULAR SEARCH
app.get('/regular/:query', (req, res) => {
    console.log(`Searching MiniSearch Index for ${req.params.query}`)

    const results = miniSearchIndex.search(req.params.query, { boost: { text: 10 }, combineWith: 'OR', })

    console.log(results.length)

    res.status(200).json({
        status: 'success',
        type: "Regular Search",
        length: results.length,
        requestedAt: req.requestTime,
        data: { results }
    })
})

// Limit search to specific book and find exact phrase within that book 
// Syntax Exmaple ---> (12Tr) "Scarlet Colored Beast"
app.get('/bookphrase/:query', (req, res) => {
    const queryExtracted = req.params.query.split(")")[1].replace(/"/g, "").trim()
    const abbrExtracted = req.params.query.match(regex.extractAbbr).join("").replace("(", "")
    console.log(`Searching MiniSearch Index for this exact phrase ---> ${queryExtracted} in this exact book ---> ${abbrExtracted}`)
    const results = miniSearchIndex.search(queryExtracted, {
        fields: ['text'], combineWith: 'AND', filter: (result) => {
            console.log(result.abbr)
            if (result.abbr === abbrExtracted && result.text.match(new RegExp(`${queryExtracted}`, "i"))) {
                return result
            }
        }
    })

    res.status(200).json({
        status: 'success',
        type: "Search in Exact Book for Exact Phrase",
        length: results.length,
        requestedAt: req.requestTime,
        data: { results }
    })
})

// Limit search to exact phrase 
// Syntax Exmaple ---> "Scarlet Colored Beast"
app.get('/phrase/:query', (req, res) => {
    const queryExtracted = req.params.query.match(regex.exactPhraseRegex).join("").replace(/\"/g, "")
    console.log(`Searching MiniSearch Index for this exact phrase ---> ${queryExtracted}`)
    const results = miniSearchIndex.search(queryExtracted, {
        fields: ['text'], combineWith: 'AND', filter: (result) => {
            if (result.text.match(new RegExp(`${queryExtracted}`, "i"))) {
                return result
            }
        }
    })

    res.status(200).json({
        status: 'success',
        type: "Search by Exact Phrase",
        length: results.length,
        requestedAt: req.requestTime,
        data: { results }
    })
})

// Limit search to specific YEAR RANGE
// Syntax Exmaple ---> (1930-1935) Scarlet Colored Beast
app.get('/yearrange/:query', (req, res) => {
    const queryExtracted = req.params.query.split(")")[1].replace(/"/g, "").trim()
    const startYear = JSON.parse(req.params.query.match(regex.extractYearRangeRegex)[0])
    const endYear = JSON.parse(req.params.query.match(regex.extractYearRangeRegex)[1])

    console.log(`Searching MiniSearch Index for ---> ${queryExtracted} in year range ${startYear} - ${endYear}`)

    const results = miniSearchIndex.search(queryExtracted, {
        fields: ['text'], combineWith: 'OR', filter: (result) => {
            if (result.year >= startYear && result.year <= endYear) {
                return result
            }
        }
    })

    res.status(200).json({
        status: 'success',
        type: "Search by Range",
        length: results.length,
        requestedAt: req.requestTime,
        data: { results }
    })
})

// Limit search to specific year
// Syntax Exmaple ---> (1945) Scarlet Colored Beast
app.get('/year/:query', (req, res) => {
    const yearSpecified = JSON.parse(req.params.query.match(regex.extractYearRegex).join(""))
    const queryExtracted = req.params.query.split(")")[1].trim()

    console.log(`Searching MiniSearch Index for ---> ${queryExtracted} within the year ${yearSpecified}`)

    const results = miniSearchIndex.search(queryExtracted, {
        fields: ['text'], boost: { text: 10 }, combineWith: 'OR', filter: (result) => {
            return result.year === yearSpecified
        }
    })

    res.status(200).json({
        status: 'success',
        type: "Search by Year",
        length: results.length,
        requestedAt: req.requestTime,
        data: { results }
    })
})

// Limit search to specific book
app.get('/book/:query', (req, res) => {
    const bookSpecified = req.params.query.match(regex.extractAbbr).join("").replace("(", "")
    const queryExtracted = req.params.query.split(")")[1].trim()
    console.log(`Searching MiniSearch Index for ---> ${queryExtracted} in ${bookSpecified}`)

    const results = miniSearchIndex.search(queryExtracted, {
        fields: ['text'], combineWith: 'OR',
        filter: (result) => result.abbr === bookSpecified
    })

    res.status(200).json({
        status: 'success',
        type: "Search by Book",
        length: results.length,
        requestedAt: req.requestTime,
        data: { results }
    })
})

app.get('/', (req, res) => {
    console.log('Hello from the Server!')

    res.status(200).json({
        status: 'success',
        requestedAt: req.requestTime,
        data: {}
    })
})

const firebaseConfig = {
    apiKey: "AIzaSyD2IKozKgSEd4jm5Ka7c5EZneipoh-_nkA",
    authDomain: "vthwritings.firebaseapp.com",
    databaseURL: "https://vthwritings.firebaseio.com",
    projectId: "vthwritings",
    storageBucket: "vthwritings.appspot.com",
    messagingSenderId: "140188975056",
    appId: "1:140188975056:web:25e50a753a8192d17203d5",
};

const appInit = initializeApp(firebaseConfig)
const firebase = ref(getDatabase(appInit))
const vthStorage = getStorage(appInit)

let miniSearchIndex = new MiniSearch({
    fields: ['text', 'subHeading', 'title'], // fields to index for full-text search
    storeFields: ['page', 'text', 'year', 'abbr', 'subHeading', 'title'], // fields to return with search results
    processTerm: (term, _fieldName) => constant.stopWords.has(term) ? null : term.toLowerCase(),
    idField: 'index'
})


const firebaseFetch = async (path) => {
    console.log(path)
    const dataSnapShot = await get(child(firebase, path))
    return dataSnapShot.val()
}

const addBookAsync = (documents) => {
    miniSearchIndex.addAll(documents)
}

const firebaseDocumentURLS = ['literatureDocuments/Tracts', 'literatureDocuments/Old Codes', 'literatureDocuments/Sermon Codes', 'literatureDocuments/Jezreel Letters', 'literatureDocuments/Answerers', 'literatureDocuments/1TG', 'literatureDocuments/2TG', 'literatureDocuments/Miscellaneous', 'literatureDocuments/1SR/1SR', 'literatureDocuments/2SR/2SR']

const getAllBooks = async () => {
    const url = firebaseDocumentURLS.splice(0, 1)
    const res = await firebaseFetch(`english/${url}`)

    if (Array.isArray(res)) {
        const abbr = res[0].page.split(" ")[0]
        // addDataToJSON(res, abbr)
        // addBookAsync(res)
    } else {
        const catOfBooksFlattened = Object.keys(res).reduce((aggr, abbr) => {
            addDataToJSON(res[abbr], abbr)
            aggr.push(...res[abbr])
            return aggr
        }, [])
        // addBookAsync(catOfBooksFlattened)
    }

    if (firebaseDocumentURLS.length) {
        // console.log(res)
        // getAllBooks()
    } else {
        console.log("All Books Processed!")
        // const file = 'searchIndex.txt';
        // writeFile(file, JSON.stringify(miniSearchIndex), (e) => console.log("Index is written out to file", e));
        app.listen(port, () => {
            console.log(`App running on port ${port}...`);
        });
    }
}

const loadJSON = (index) => {
    return MiniSearch.loadJS(index, {
        fields: ['text', 'subHeading', 'title'],
        storeFields: ['page', 'text', 'year', 'abbr', 'subHeading', 'title'],
        processTerm: (term, _fieldName) => constant.stopWords.has(term) ? null : term.toLowerCase(),
        idField: "index"
    })
}

const init = async () => {
    // if (existsSync("searchIndex.txt")) {
    //     console.log("Search Index exists!")
    // readFile("searchIndex.txt", {}, (e, data) => {           
    //     miniSearchIndex = loadJSON(data) 
    // },)

    if (miniSearchIndex._documentCount === 0) {
        // return
        // const indexRef = sRef(vthStorage, "searchIndex/searchIndex.txt")
        // const uri = { uri: await getDownloadURL(indexRef) }
        // console.log(uri)

        const dataRaw = await fetch(`https://drive.google.com/uc?export=download&id=1InALaFCKHt0ZzQI8eFEXDnSjF7hYgccT`)
        // console.log(await dataRaw.json())
        const data = await dataRaw.json()
        miniSearchIndex = loadJSON(data)
        // console.log(miniSearchIndex.search("Truth"))
        app.listen(port, () => {
            console.log(`App running on port ${port}...`);
        });
    } else {
        console.log("Search Index Already Loaded")
    }
    // }
}

init()

const port = process.env.PORT || 3000;