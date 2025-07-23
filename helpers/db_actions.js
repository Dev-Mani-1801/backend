import mongoose from 'mongoose';

async function users_count_comparision() {
    const usersCollection = mongoose.connection.db.collection('users');

    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(now.getDate() - 14);

    const thisWeekCount = await usersCollection.countDocuments({
    createdAt: { $gte: oneWeekAgo }
    });

    const lastWeekCount = await usersCollection.countDocuments({
    createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
    });

    const usersCount = await usersCollection.countDocuments();

    let growthPercent = 0;
    if (lastWeekCount > 0) {
    growthPercent = ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100;
    } else if (thisWeekCount > 0) {
    growthPercent = 100;
    }

    growthPercent = Math.round(growthPercent * 10) / 10;

    const percentage_string = `${growthPercent >= 0 ? '+ ' : '- '}${Math.abs(growthPercent)}%`;

    return percentage_string;
}


export default users_count_comparision;
