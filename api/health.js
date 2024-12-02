export default function handler(req, res) {
    console.log('Health check accessed:', new Date().toISOString());
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString()
    });
}