exports.up = async function (knex) {
    if (await knex.schema.hasTable('currency')) return;
    await knex.schema.createTable('currency', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.boolean('status').defaultTo(false);
        table.string('unit').nullable();
    });
    // Same rows as seeds/currency.js, so a fresh install has an active currency without
    // running seeds by hand.
    await knex('currency').insert([
        { name: 'INR', status: false },
        { name: 'Euro', status: true },
    ]);
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('currency');
};
