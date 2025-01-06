import { readFile } from 'fs/promises';
import { DataAPIClient } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import "dotenv/config";
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});

const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(process.env.ASTRA_DB_API_ENDPOINT, {
    namespace: process.env.ASTRA_DB_NAMESPACE,
});

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
});

const createCollection = async () => {
    try {
        await db.createCollection('portfolio', {
            vector: {
                dimension: 1536,
            },
        });
    } catch (error) {
        console.error('Collection already exists');
    }
};

// Load JSON data using fs
const loadData = async () => {
    const collection = await db.collection('portfolio');
    
    // Read and parse JSON file
    const data = JSON.parse(await readFile(new URL('./data.json', import.meta.url)));

    for await (const { id, info, description } of data) {
        // Split the data into chunks
        const chunks = await splitter.splitText(description);
        let i = 0;

        // Generate vector embeddings for each of the chunks
        for await (const chunk of chunks) {
            const { data } = await openai.embeddings.create({
                input: chunk,
                model: 'text-embedding-3-small',
            });
            const res = await collection.insertOne({
                document_id: id,
                $vector: data[0]?.embedding,
                info,
                description: chunk,
            });
            i++;
        }
    }

    console.log('Data has been added to vector database');
};

createCollection().then(() => loadData());
