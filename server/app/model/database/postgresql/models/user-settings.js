"use strict";

module.exports = function(sequelize, DataTypes) {
  var UserSettings = sequelize.define("UserSettings", {
      property: {
        type: DataTypes.STRING,
        primaryKey: true
      },
      owner: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: {
            model: 'User', // Can be both a string representing the table name, or a reference to the model
            key:   "id"
        }
    },
    value: DataTypes.STRING
  }, {
    underscored: true, // transform the columns camelCase into underscored table_name.
    tableName: 'user_settings',
    freezeTableName: true
  });
  return UserSettings;
};
