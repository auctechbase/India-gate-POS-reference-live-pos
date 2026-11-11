// Website orders copied from the website's POS API, plus the small key/value store the sync
// uses (API url + key, sync cursor). The key is kept out of `settings` on purpose: /config
// returns every row of that table to the UI.
exports.up = async function (knex) {
    if (!(await knex.schema.hasTable('web_orders'))) {
        await knex.schema.createTable('web_orders', (table) => {
            // The website's own order id, so an order can never be saved twice.
            table.integer('id').primary();
            table.string('order_number');
            table.string('status');
            table.text('data'); // the order object from the API, as JSON
            table.timestamps(true, true);
        });
    }
    if (!(await knex.schema.hasTable('website_state'))) {
        await knex.schema.createTable('website_state', (table) => {
            table.string('key').primary();
            table.text('value');
        });
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('web_orders');
    await knex.schema.dropTableIfExists('website_state');
};
