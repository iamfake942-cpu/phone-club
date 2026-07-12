const db = require("../db");
const https = require("https");
const { findActiveUserById, publicUser } = require("./auth.service");

async function getAddressesByUserId(userId) {
  const [addresses] = await db.query(
    `SELECT
       id,
       label,
       address_line1,
       address_line2,
       city,
       state,
       postal_code,
       country,
       latitude,
       longitude,
       is_default,
       created_at,
       updated_at
     FROM user_addresses
     WHERE user_id = ?
     ORDER BY is_default DESC, updated_at DESC`,
    [userId]
  );

  return addresses;
}

async function getAddressById(userId, addressId) {
  const [[address]] = await db.query(
    `SELECT
       id,
       label,
       address_line1,
       address_line2,
       city,
       state,
       postal_code,
       country,
       latitude,
       longitude,
       is_default,
       created_at,
       updated_at
     FROM user_addresses
     WHERE user_id = ? AND id = ?
     LIMIT 1`,
    [userId, addressId]
  );

  return address || null;
}

async function countAddresses(userId) {
  const [[row]] = await db.query(
    "SELECT COUNT(*) AS count FROM user_addresses WHERE user_id = ?",
    [userId]
  );

  return Number(row.count || 0);
}

async function reverseGeocodeCoordinates(latitude, longitude) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("addressdetails", "1");

  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "phone-club-backend/1.0",
          },
        },
        (res) => {
          let body = "";

          res.on("data", (chunk) => {
            body += chunk;
          });

          res.on("end", () => {
            if (res.statusCode !== 200) {
              return reject(new Error("Failed to reverse geocode coordinates"));
            }

            try {
              const data = JSON.parse(body);
              const address = data.address || {};

              const addressLine1 = [
                address.house_number,
                address.road || address.pedestrian || address.cycleway || address.footway,
              ]
                .filter(Boolean)
                .join(" ");

              const addressLine2 = address.suburb || address.neighbourhood || address.city_district || null;
              const city = address.city || address.town || address.village || address.hamlet || null;
              const state = address.state || address.region || null;
              const postal_code = address.postcode || null;
              const country = address.country || null;

              resolve({
                address_line1: addressLine1 || null,
                address_line2: addressLine2,
                city,
                state,
                postal_code,
                country,
                latitude,
                longitude,
              });
            } catch (error) {
              reject(error);
            }
          });
        }
      )
      .on("error", reject);
  });
}

async function clearDefaultForUser(userId, exceptAddressId = null) {
  if (exceptAddressId) {
    await db.query(
      `UPDATE user_addresses
       SET is_default = FALSE
       WHERE user_id = ? AND id != ?`,
      [userId, exceptAddressId]
    );
  } else {
    await db.query(
      `UPDATE user_addresses
       SET is_default = FALSE
       WHERE user_id = ?`,
      [userId]
    );
  }
}

async function createAddress(userId, address) {
  const {
    label = "home",
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    latitude,
    longitude,
    is_default,
  } = address;

  const addressCount = await countAddresses(userId);
  const shouldDefault = addressCount === 0 || is_default === true;

  if (shouldDefault) {
    await clearDefaultForUser(userId);
  }

  const [result] = await db.query(
    `INSERT INTO user_addresses
       (user_id, label, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      label,
      address_line1,
      address_line2 || null,
      city,
      state,
      postal_code,
      country,
      latitude == null ? null : latitude,
      longitude == null ? null : longitude,
      shouldDefault ? 1 : 0,
    ]
  );

  return getAddressById(userId, result.insertId);
}

async function updateAddressById(userId, addressId, address) {
  const {
    label,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    latitude,
    longitude,
    is_default,
  } = address;

  const existingAddress = await getAddressById(userId, addressId);

  if (!existingAddress) {
    const error = new Error("Address not found");
    error.statusCode = 404;
    throw error;
  }

  if (is_default === true) {
    await clearDefaultForUser(userId, addressId);
  }

  await db.query(
    `UPDATE user_addresses
     SET label = COALESCE(?, label),
         address_line1 = COALESCE(?, address_line1),
         address_line2 = ?,
         city = COALESCE(?, city),
         state = COALESCE(?, state),
         postal_code = COALESCE(?, postal_code),
         country = COALESCE(?, country),
         latitude = ?,
         longitude = ?,
         is_default = COALESCE(?, is_default),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
    [
      label,
      address_line1,
      address_line2 || null,
      city,
      state,
      postal_code,
      country,
      latitude == null ? null : latitude,
      longitude == null ? null : longitude,
      typeof is_default === "boolean" ? Number(is_default) : null,
      userId,
      addressId,
    ]
  );

  return getAddressById(userId, addressId);
}

async function deleteAddressById(userId, addressId) {
  const address = await getAddressById(userId, addressId);

  if (!address) {
    const error = new Error("Address not found");
    error.statusCode = 404;
    throw error;
  }

  await db.query(
    "DELETE FROM user_addresses WHERE user_id = ? AND id = ?",
    [userId, addressId]
  );

  if (address.is_default) {
    const [remainingAddresses] = await db.query(
      `SELECT id
       FROM user_addresses
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId]
    );

    if (remainingAddresses.length > 0) {
      await db.query(
        `UPDATE user_addresses
         SET is_default = TRUE
         WHERE id = ?`,
        [remainingAddresses[0].id]
      );
    }
  }
}

async function setDefaultAddressById(userId, addressId) {
  const address = await getAddressById(userId, addressId);

  if (!address) {
    const error = new Error("Address not found");
    error.statusCode = 404;
    throw error;
  }

  await clearDefaultForUser(userId, addressId);

  await db.query(
    `UPDATE user_addresses
     SET is_default = TRUE,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
    [userId, addressId]
  );

  return getAddressById(userId, addressId);
}

async function updateUserName(userId, name) {
  await db.query(
    `UPDATE users
     SET name = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [name.trim(), userId]
  );
}

async function getProfile(userId) {
  const user = await findActiveUserById(userId);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const addresses = await getAddressesByUserId(userId);
  const defaultAddress = addresses.find((address) => address.is_default) || null;

  return {
    user: publicUser(user),
    default_address: defaultAddress,
    addresses,
  };
}

async function updateProfile(userId, updates) {
  const { name } = updates;

  if (name) {
    await updateUserName(userId, name);
  }

  return getProfile(userId);
}

module.exports = {
  getProfile,
  updateProfile,
  getAddressesByUserId,
  getAddressById,
  createAddress,
  updateAddressById,
  deleteAddressById,
  setDefaultAddressById,
  reverseGeocodeCoordinates,
};
