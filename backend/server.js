const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const wordSets = require('./word-sets.js'); // 서버가 직접 단어 데이터를 불러옴

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

        // GET /api/data : 모든 데이터를 가져오는 API
        app.get('/api/data', async (req, res) => {
            try {
                let result = await collection.findOne({ _id: 'main' });
                if (!result) {
                    const initialData = { vocabularyData: [], addedSets: [], incorrectCounts: {} };
                    await collection.insertOne({ _id: 'main', data: initialData });
                    result = { data: initialData };
                }
                res.json(result.data);
            } catch (e) { res.status(500).json({ message: "DB 조회 오류" }); }
        });

        // ✨ [핵심 개선] 세트 추가 API: 이제 이 API가 직접 데이터를 처리합니다.
        app.post('/api/add-words', async (req, res) => {
            try {
                const { words, sets } = req.body;
                if (!words || !words.length) return res.status(400).json({ message: '추가할 단어가 없습니다.' });

                const doc = await collection.findOne({ _id: 'main' });
                const currentVocab = doc.data.vocabularyData || [];
                
                const newUniqueWords = words.filter(newWord => 
                    !currentVocab.some(existingWord => existingWord.japanese === newWord.japanese)
                );

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
        
        // POST /api/incorrect/update : 오답 횟수만 수정하는 API
        app.post('/api/incorrect/update', async (req, res) => { /* 이전 코드 */ });
        
        // ✨ [핵심 개선] 단어 목록만 삭제하는 API (오답 기록 보존)
        app.post('/api/delete-all-words', async (req, res) => {
            try {
                await collection.updateOne({ _id: 'main' }, { $set: { 'data.vocabularyData': [], 'data.addedSets': [] } });
                res.status(200).json({ message: '단어 목록 삭제 성공' });
            } catch (e) { res.status(500).json({ message: "전체 삭제 중 오류" }); }
        });

        // POST /api/shuffle-words : 단어 목록 순서만 섞는 API
        app.post('/api/shuffle-words', async (req, res) => {
            try {
                const { shuffledVocabularyData } = req.body;
                await collection.updateOne({ _id: 'main' }, { $set: { 'data.vocabularyData': shuffledVocabularyData } });
                res.status(200).json({ message: '순서 섞기 성공' });
            } catch (e) { res.status(500).json({ message: "순서 섞기 중 오류" }); }
        });

        app.listen(port, () => { console.log(`최종 안정화 서버가 ${port}번 포트에서 실행 중입니다.`); });
    } catch (e) {
        console.error("DB 연결 실패.", e);
        process.exit(1);
    }
}

startServer();

// (편의상 생략된 함수들의 전체 코드)
app.post('/api/incorrect/update', async(req, res) => { const { word, count } = req.body; if (!word || typeof count !== 'number') { return res.status(400).json({ message: '잘못된 요청' }); } try { const collection = client.db(dbName).collection(collectionName); await collection.updateOne({ _id: 'main' }, { $set: { [`data.incorrectCounts.${word}`]: count } }); res.status(200).json({ message: '오답 횟수 업데이트 성공' }); } catch (e) { res.status(500).json({ message: "오답 횟수 업데이트 중 오류" }); } });