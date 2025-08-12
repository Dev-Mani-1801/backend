import express from 'express';
import SubscriptionPlan from '../../models/SubscriptionPlan.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { name, hashrate, duration, maintenance_cost, plan_cost } = req.body;

    const newPlan = new SubscriptionPlan({
      id: uuidv4(),
      name,
      hashrate: parseFloat(hashrate),
      duration: parseInt(duration),
      maintenance_cost: parseFloat(maintenance_cost),
      plan_cost: parseFloat(plan_cost),
    });

    await newPlan.save();

    res.redirect('/admin/subscriptionplans');
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ plan_cost: 1 });
    res.status(200).json({ success: true, plans });
  } catch (err) {
    console.error('Error fetching subscription plans:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await SubscriptionPlan.findOneAndDelete({ id });

    if (!result) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.status(200).json({ message: 'Plan deleted' });
  } catch (err) {
    console.error('Error deleting plan:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
