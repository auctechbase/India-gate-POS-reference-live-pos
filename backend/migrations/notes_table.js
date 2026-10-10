exports.up = async function (knex) {

    if (await knex.schema.hasTable('notes')) return;
    await knex.schema.createTable('notes', (table) => {
        table.increments('id').primary(); // Auto-incrementing ID
        table.string('image');
        table.string('amount');
        table.boolean('status').defaultTo(true);
    });

};

exports.down = async function (knex) {
    // Drop the `users` table
    await knex.schema.dropTableIfExists('notes');
};







