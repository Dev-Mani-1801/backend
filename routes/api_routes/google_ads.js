// api_routes/google_ads.js
import express from "express";
import GoogleAds from '../../models/GoogleAds.js';

const router = express.Router();

router.get('/id/ios', async (req, res) => {
  try {
    const is_production = req.body.production;

    const ad_details = await GoogleAds.find().sort({ platform: "ios", production: is_production });
    res.status(200).json({ success: true, ad_details });
  } catch (err) {
    console.error('Error fetching subscription plans:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.get('/id/android', async (req, res) => {
  try {
    const ad_details = await GoogleAds.find().sort({ platform: "android", production: is_production });
    res.status(200).json({ success: true, ad_details });
  } catch (err) {
    console.error('Error fetching subscription plans:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

export default router;
