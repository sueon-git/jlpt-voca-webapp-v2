const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const port = 3000;

const uri = "mongodb+srv://ghdtnsqls11:ghdtnsqls11@cluster0.7vvslpu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

const dbName = 'jlpt-vocab-app-v2';
const collectionName = 'data';

const corsOptions = {
  origin: 'https://my-vocab-app-sync-v2.netlify.app',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

async function startServer() {
    try {
        await client.connect();
        console.log("MongoDB Atlas 데이터베이스에 성공적으로 연결되었습니다.");
        const collection = client.db(dbName).collection(collectionName);

        app.get('/api/data', async (req, res) => {
            try {
                const result = await collection.findOne({ _id: 'main' });
                if (result && result.data) {
                    res.json(result.data);
                } else {
                    const initialData = { vocabularyData: [], addedSets: [], incorrectCounts: {} };
                    await collection.insertOne({ _id: 'main', data: initialData });
                    res.json(initialData);
                }
            } catch (e) { res.status(500).json({ message: "DB 조회 오류" }); }
        });

        app.post('/api/words/add', async (req, res) => {
            try {
                const { words, sets } = req.body;
                if (!words || !words.length) return res.status(400).json({ message: '추가할 단어가 없습니다.' });
                const doc = await collection.findOne({ _id: 'main' });
                const currentVocab = doc.data.vocabularyData || [];
                const newUniqueWords = words.filter(newWord => !currentVocab.some(ex => ex.japanese === newWord.japanese));
                const updateQuery = {};
                if (newUniqueWords.length > 0) {
                    updateQuery.$push = { 'data.vocabularyData': { $each: newUniqueWords } };
                }
                if (sets && sets.length > 0) {
                    updateQuery.$addToSet = { 'data.addedSets': { $each: sets } };
                }
                if (Object.keys(updateQuery).length > 0) {
                    await collection.updateOne({ _id: 'main' }, updateQuery, { upsert: true });
                }
                res.status(200).json({ message: '단어 추가 성공' });
            } catch (e) { res.status(500).json({ message: "단어 추가 중 오류" }); }
        });
        
        app.post('/api/incorrect/update', async (req, res) => {
            const { word, count } = req.body;
            try {
                await collection.updateOne({ _id: 'main' }, { $set: { [`data.incorrectCounts.${word}`]: count } });
                res.status(200).json({ message: '오답 횟수 업데이트 성공' });
            } catch (e) { res.status(500).json({ message: "오답 횟수 업데이트 중 오류" }); }
        });
        
        app.post('/api/data/replace', async (req, res) => {
            try {
                const newData = req.body;
                await collection.updateOne({ _id: 'main' }, { $set: { data: newData } }, { upsert: true });
                res.status(200).json({ message: '데이터 교체 성공' });
            } catch (e) { res.status(500).json({ message: "데이터 교체 중 오류" }); }
        });

        app.delete('/api/words/:id', async (req, res) => {
            try {
                const wordId = Number(req.params.id);
                await collection.updateOne({ _id: 'main' }, { $pull: { 'data.vocabularyData': { id: wordId } } });
                res.status(200).json({ message: '단어 삭제 성공' });
            } catch (e) { res.status(500).json({ message: "단어 삭제 중 오류" }); }
        });

        app.listen(port, () => { console.log(`서버가 ${port}번 포트에서 실행 중입니다.`); });
    } catch (e) {
        console.error("DB 연결 실패.", e);
        process.exit(1);
    }
}
startServer();