// CommonJS constants file for use in Knex seeds
const Roles = {
  CUSTOMER: { id: 'customer', name: 'Customer', description: 'End customer' },
  ADMIN: { id: 'admin', name: 'Admin', description: 'Administrator' },
  DRIVER: { id: 'driver', name: 'Driver', description: 'Delivery driver' }
};

module.exports = { Roles };
