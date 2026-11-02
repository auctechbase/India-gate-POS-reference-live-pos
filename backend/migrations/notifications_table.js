exports.up = async function (knex) {

    if (await knex.schema.hasTable('web_notifications')) return;
    await knex.schema.createTable('web_notifications', (table) => {
        table.increments('id').primary(); // Auto-incrementing ID
        table.string('content');
        table.string('icon');
        table.boolean('read').defaultTo(false);
        table.timestamps(true,true);
    });

};

exports.down = async function (knex) {
    // Drop the `users` table
    await knex.schema.dropTableIfExists('web_notifications');
};