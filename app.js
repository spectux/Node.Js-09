const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');

const app = express();

const dbPath = path.join(__dirname, 'covid19India.db');
let db;

app.use(express.json());

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3001, () => {
      console.log('Server Running at http://localhost:3001/');
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();


const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return response.status(401).send('Invalid JWT Token');
  }

  const secretKey = 'abcde';

  jwt.verify(token, secretKey, (error, user) => {
    if (error) {
      return response.status(401).send('Invalid JWT Token');
    }

    request.user = user;
    next();
  });
};

// API 1
app.post('/login/', async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `;

  const dbUser = await db.get(selectUserQuery);

  if (!dbUser) {
    response.status(400).send('Invalid user');
  } else if (dbUser.password !== password) {
    response.status(400).send('Invalid password');
  } else {
    const secretKey = 'abcde';
    const jwtToken = jwt.sign({ username }, secretKey, { expiresIn: '1h' });

    response.json({ jwtToken });
  }
});

const convertDbObjectResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

// API 2
app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT 
      *
    FROM 
      state;`;

  const statesArray = await db.all(getStatesQuery);
  response.json(
    statesArray.map((eachState) => convertDbObjectResponseObject(eachState))
  );
});

// API 3
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT 
      *
    FROM 
      state
    WHERE
      state_id = ${stateId};`;

  const state = await db.get(getStateQuery);

  if (!state) {
    response.status(404).send('State not found');
  } else {
    response.json(convertDbObjectResponseObject(state));
  }
});

const convertDbDistrictObjectResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

// API 4
app.post('/districts/', authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;

  if (!districtName || !stateId || !cases || !cured || !active || !deaths) {
    return response.status(400).send('Bad Request');
  }

  const insertDistrictQuery = `
    INSERT INTO 
      district (district_name, state_id, cases, cured, active, deaths)
    VALUES
      ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});
  `;

  try {
    await db.run(insertDistrictQuery);
    response.send('District Successfully Added');
  } catch (error) {
    console.error(`Error adding district: ${error.message}`);
    response.status(500).send('Internal Server Error');
  }
});

// API 5
app.get('/districts/:districtId/', authenticateToken, async (request, response) => {
  const { districtId } = request.params;
  const getDistrictQuery = `
    SELECT 
      *
    FROM 
      district
    WHERE
      district_id = ${districtId};`;

  try {
    const district = await db.get(getDistrictQuery);

    if (!district) {
      response.status(404).send('District not found');
    } else {
      response.json(convertDbDistrictObjectResponseObject(district));
    }
  } catch (error) {
    console.error(`Error fetching district: ${error.message}`);
    response.status(500).send('Internal Server Error');
  }
});

// API 6
app.delete('/districts/:districtId/', authenticateToken, async (request, response) => {
  const { districtId } = request.params;
  const deleteDistrictQuery = `
    DELETE FROM
      district
    WHERE
      district_id = ${districtId};`;

  try {
    const result = await db.run(deleteDistrictQuery);

    if (result.changes > 0) {
      response.send('District Removed');
    } else {
      response.status(404).send('District not found');
    }
  } catch (error) {
    console.error(`Error deleting district: ${error.message}`);
    response.status(500).send('Internal Server Error');
  }
});

// API 7
app.put('/districts/:districtId/', authenticateToken, async (request, response) => {
  const { districtId } = request.params;
  const districtDetails = request.body;
  const { districtName, stateId, cases, cured, active, deaths } = districtDetails;

  const updateDistrictQuery = `
    UPDATE
      district
    SET
      district_name = '${districtName}',
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active},
      deaths = ${deaths}
    WHERE
      district_id = ${districtId};`;

  try {
    const result = await db.run(updateDistrictQuery);

    if (result.changes > 0) {
      response.send('District Details Updated');
    } else {
      response.status(404).send('District not found');
    }
  } catch (error) {
    console.error(`Error updating district details: ${error.message}`);
    response.status(500).send('Internal Server Error');
  }
});

// API 8
app.get('/states/:stateId/stats/', authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateStatsQuery = `
    SELECT 
      SUM(cases) as total_cases,
      SUM(cured) as total_cured,
      SUM(active) as total_active,
      SUM(deaths) as total_deaths
    FROM 
      district
    WHERE
      state_id = ${stateId};`;

  try {
    const stats = await db.get(getStateStatsQuery);

    if (!stats) {
      response.status(404).send('State not found');
    } else {
      response.json({
        totalCases: stats.total_cases,
        totalCured: stats.total_cured,
        totalActive: stats.total_active,
        totalDeaths: stats.total_deaths,
      });
    }
  } catch (error) {
    console.error(`Error fetching state stats: ${error.message}`);
    response.status(500).send('Internal Server Error');
  }
});


module.exports = app;
