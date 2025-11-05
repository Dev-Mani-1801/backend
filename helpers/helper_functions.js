import mongoose from 'mongoose';

async function total_users() {
    var usersCount = 0;

    const collections = await mongoose.connection.db.listCollections().toArray();
    const tableNames = collections.map(col => col.name);
    
    if (tableNames.includes('users')) {
        const usersData = await mongoose.connection.db.collection('users').find({}).toArray();

        const usersCollection = mongoose.connection.db.collection('users');
        usersCount = await usersCollection.countDocuments();

        // console.log("Users: ", usersCount);

    } else {
        usersCount = 0
        console.warn('No "users" collection found.');
    }

    return usersCount;
}

async function table_names() {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const tableNames = collections.map(col => col.name);

    console.log("Tables: ", tableNames)
    return tableNames;
}

async function total_transactions() {
    const TransactionsCollection = mongoose.connection.db.collection('transactions');
    const TransactionsCount = await TransactionsCollection.countDocuments();

    return TransactionsCount;
}

async function TotalSupportTickets() {
    const SupportTicketsCollection = mongoose.connection.db.collection('SupportTicket');
    const SupportTicketsCount = await SupportTicketsCollection.countDocuments();

    return SupportTicketsCount;
}

async function TotalFAQs() {
    const FAQsCountCollection = mongoose.connection.db.collection('faqs');
    const FAQsCount = await FAQsCountCollection.countDocuments();

    return FAQsCount;
}

export default {
    total_users,
    table_names,
    total_transactions,
    TotalSupportTickets,
    TotalFAQs
}