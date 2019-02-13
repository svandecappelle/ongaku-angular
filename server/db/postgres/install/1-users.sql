CREATE TABLE users (
	id serial PRIMARY KEY,
	username varchar NOT NULL,
	password varchar NOT NULL,
	banned boolean default false,
	created_at timestamp,
	updated_at timestamp,
	deleted_at timestamp
);