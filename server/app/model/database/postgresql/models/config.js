"use strict";

module.exports = function(sequelize, DataTypes) {
  var Config = sequelize.define("Config", {
    property: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    value: DataTypes.STRING
  }, {
    tableName: 'config',
    timestamps: true, // don't add the timestamp attributes (updatedAt, createdAt)
    underscored: true // transform the columns camelCase into underscored table_name.
  });

  return Config;
};
