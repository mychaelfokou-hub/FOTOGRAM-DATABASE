//APPUTI:
//alla fine la req.param (che definisce le rotte) finisce insieme ai parametri della req.query, lo swagger non li differenzia




const crypto = require('crypto') //modulo interno a node per la crittografia
const jwt = require('jsonwebtoken') //Stai importando l'intera libreria jsonwebtoken e la assegni alla variabile jwt
require('dotenv').config(); //Importa la libreria dotenv e accede alle variabili definite nel file .env
const jwt_secret = process.env.JWT_SECRET; //Recupera la chiave segreta JWT salvata nel file .env e la assegna a una variabile per firmare/verificare i token.



// endpoints.js si collega a PostgreSQL
const { Pool } = require('pg'); 
const pool = new Pool({ //crea un oggetto di tipo Pool (che gestisce le connessioni a PostgreSQL)
  user: 'postgres', 
  host: 'localhost',
  database: 'fotogram',
  password: '658mike',
  port: 5432
});

//inizializzazioe enpoints
module.exports = function (app) {
  app.post('/register', register)
  app.post('/login', login)
	app.post('/logout', auth, logout)
	app.post('/refresh', auth, refresh)
  //PRIVILEGIO: ADMIN
  //MODERATORE
  app.post('/admin/moderatore/:username', auth, postModeratore);
  app.delete('/admin/moderatre/:username', auth, deleteModeratore);

  //PRIVILEGIO: MODERATORE, ADMIN
  //MODERATORE
  app.get('/moderatore/moderatori', auth, getModeratori);
  app.get('/moderatore/utenti', auth, getUtentiModerati);
  //POST
  app.get('/moderatore/flagged', auth, getFlaggedPosts);
  app.get('/moderatore/flagged/:idPost', auth, getFlaggedPost);
  app.get('/moderatore/postModerati', auth, getPostModerati);
  //MODERAZIONE
  app.post('/posts/:idPost/moderazioni', auth, moderaPost);
  app.delete('/posts/:idPost/moderazioni', auth, annullaModerazione);

  //PRIVILEGIO: UTENTE, MODERATORE, ADMIN
  //UTENTE
  app.post('/utente/immagineProfilo', auth, cambiaImgProfilo);
  app.get('/utenti', auth, getUtenti); 
  app.delete('/utente', auth, deleteUtente);
  app.get('/utente/:username', auth, getUtente); 
  app.patch('/utente', auth, patchUtente);
  app.get('/utente/:username/following', auth, getSeguiti);
  app.get('/utente/:username/followers', auth, getSeguaci);

  //POST
  app.get('/posts', auth, getPosts);
  app.get('/utente/:username/posts', auth, getUserPosts); 
  app.get('/utente/:username/post/:idPost', auth, getUserPost);
  app.post('/utente/post/immagine', auth, creaPostImmagine); 
  app.post('/utente/post/testo', auth, creaPostTesto); 
  app.patch('/utente/post/immagine/:idPost', auth, patchPostImmagine);
  app.patch('/utente/post/testo/:idPost', auth, patchPostTesto);
  app.delete('/utente/:username/post/:idPost', auth, deletePost);

  
  //SEGUIRE
  app.post('/utente/:username/follow', auth, seguiUtente);
  app.delete('/utente/:username/follow', auth, smettiDiSeguire);
  
 //LIKE 
  app.post('/posts/:idPost/like', auth, mettiLike);
  app.delete('/posts/:idPost/like', auth, rimuoviLike);

  //FLAG 
  app.post('/posts/:idPost/flag', auth, flaggaPost);
  app.delete('/posts/:idPost/flag', auth, rimuoviFlag);

  //NUOVI ENPOINTS
  
  app.post('/utente/post/checkinPost', auth, creaPostCheckin)
  app.patch('/utente/post/checkinPost/:idPost', auth, patchPostCheckin)
  
  app.post('/utente/post/:idPost/selezione', auth, selezionaPartecipante);
  app.delete('/utente/post/:idPost/deselezione', auth, deselezionaPartecipante);
  app.post('/utente/post/:idPost/commento', auth, aggiungiCommento); 
  app.get('/utente/post/:idPost/commento', auth, leggiCommento); 
  app.get('/utente/classifica/:tipo', auth, classifica); 

};

const auth = (req, res, next) => { 
  //ad ogni enpoint verifica se il token è corretto e valido
	const token = req.headers['bearer']

	if(!token)
		return res.status(400).send({message: 'No token provided.' })

	jwt.verify(token, jwt_secret, (err, pay) => { //fa la verifica del token per mezzo della chiave che l'ha creata
		if(err) {
			console.log(err)
			return res.status(401).send({message: 'Token not valid.' })
		}

		req.user = pay.username //se il token verifica, il payload  e' valido
    req.idSessione = pay.idSessione
		next()
	})
}
const register = (req, res) => {
	// #swagger.tags = ['Auth']
	// #swagger.summary = 'Registra utente'

	if(!req.body || !req.body.username || !req.body.password || !req.body.mail.includes('@'))
		return res.status(400).send({message: 'Parameters missing or invalid.' })

	const salt = crypto.randomBytes(16).toString('hex') //salt personale: stessa pass, hash diversi per ogni utente

	crypto.scrypt(req.body.password, salt, 64, (err, hash) => { //produce la hash dalla pass e salt
		const query = `
		INSERT INTO Utente (username, password, mail)
		VALUES ($1, $2, $3)
		RETURNING username;`
		const qvals = [req.body.username, hash.toString('hex') + "." + salt, req.body.mail]

		pool.query(query, qvals).then((results) => {
			return res.send('Utente creato')
		}).catch((err) => {
			console.log(err)
			return res.status(500).send({message: 'Query error.' })
		})
	})
}
const login = (req, res) => {
  // #swagger.tags = ['Auth']
  // #swagger.summary = 'Accedi al social network con un account registrato'
  if (!req.body?.username || !req.body?.password) {
    return res.status(400).send({ message: 'Parametri mancanti o invalidi' });
  }

  
  const query = `SELECT password FROM Utente WHERE username = $1`;
  const values = [req.body.username];

  pool.query(query, values)
    .then((results) => {
      if (results.rows.length === 0) {
        return res.status(401).send({ message: 'Non esiste questo username' });
      }

      const [hpass, salt] = results.rows[0].password.split('.');

      crypto.scrypt(req.body.password, salt, 64, (err, hash) => {
        if (err || hash.toString('hex') !== hpass) {
          return res.status(401).send({ message: 'Credenziali errate.' });
        }
        //check se esiste già una sessione
        const querySessione = `
          SELECT * FROM Sessione 
          WHERE username = $1 AND dataOraFine > CURRENT_TIMESTAMP
        `;

        pool.query(querySessione, [req.body.username])
          .then((results) => {
            const dataOraFine = new Date(Date.now() + 30 * 60 * 1000);
            //se esiste, la estende
            if (results.rows.length > 0) {
              const idsessione = results.rows[0].idSessione || results.rows[0].idsessione;
              const updateQuery = `
                UPDATE Sessione
                SET dataOraFine = $1
                WHERE idSessione = $2
                RETURNING idSessione
              `;
              return pool.query(updateQuery, [dataOraFine, idsessione]);
            } else {
              //altrimenti ne crea una nuova
              const insertQuery = `
                INSERT INTO Sessione (username, dataOraFine)
                VALUES ($1, $2)
                RETURNING idSessione
              `;
              return pool.query(insertQuery, [req.body.username, dataOraFine]);
            }
          })
          .then((result) => {
            const raw = result.rows[0];
            const idsessione = raw.idsessione || raw.idSessione;

            if (!idsessione) {
              return res.status(500).send({ message: 'ID sessione mancante' });
            }

            const payload = { username: req.body.username, idsessione: idsessione.toString() };
            const token = jwt.sign(payload, jwt_secret, { expiresIn: 5 * 60 });
            const refresh = jwt.sign(payload, idsessione.toString());
            return res.send({ token, refresh });
          })
          .catch((err) => {
            console.error(err);
            return res.status(500).send({ message: 'Errore durante il login/sessione' });
          });
      });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).send({ message: 'Query error' });
    });
};
const refresh = (req, res) => {
  // #swagger.tags = ['Auth']
  // #swagger.summary = 'Genera un nuovo token di accesso a partire dal refresh token'

  const { refresh } = req.body;
  if (!refresh) return res.status(400).send({ message: 'Token di refresh mancante' });

  let payload;
  try {
    // Decodifica il refresh token (usando idsessione come chiave)
    payload = jwt.decode(refresh);
    if (!payload?.username || !payload?.idsessione) {
      return res.status(401).send({ message: 'Token non valido' });
    }
    jwt.verify(refresh, payload.idsessione); // verifica usando idsessione come chiave
  } catch (err) {
    return res.status(401).send({ message: 'Refresh token non valido o scaduto' });
  }

  const { username, idsessione } = payload;

  const querySessione = `
    SELECT * FROM Sessione 
    WHERE idSessione = $1 AND username = $2 AND dataOraFine > CURRENT_TIMESTAMP
  `;

  pool.query(querySessione, [idsessione, username])
    .then((result) => {
      if (result.rows.length === 0) {
      //al logout, dataOraFine della sessione sarà minore della dataOra attuale e la query nn la troverà più
        return res.status(401).send({ message: 'Sessione non valida o scaduta' }); 
      }

      const nuovaScadenza = new Date(Date.now() + 30 * 60 * 1000); // 30 minuti

      const updateQuery = `
        UPDATE Sessione 
        SET dataOraFine = $1 
        WHERE idSessione = $2
      `;
      return pool.query(updateQuery, [nuovaScadenza, idsessione]);
    })
    .then(() => {
      const newToken = jwt.sign({ username, idsessione }, jwt_secret, { expiresIn: 5 * 60 });
      return res.send({ token: newToken }); // Il refresh resta invariato
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).send({ message: 'Errore durante il refresh del token' });
    });
};
const logout = (req, res) => {
	// #swagger.tags = ['Auth']
	// #swagger.summary = 'Scollega utente'

  //const dataOraFine = new Date(Date.now())

	const query = `
        UPDATE Sessione SET dataOraFine = CURRENT_TIMESTAMP::timestamp WHERE username = $1 AND idSessione = $2
    `
	const values = [req.username,req.idSessione]

	pool.query(query, values).then((results) => {
		return res.send({message: 'Logged out.' })
	}).catch((err) => {
		console.log(err)
		return res.status(500).send({message: 'Errore durante il logout' })
	})
}

const isAdmin = async (username) => {
  // Primo controllo: è moderatore?
  const isMod = await isModeratore(username);
  if (!isMod) return false;

  // Secondo controllo: è amministratore?
  const query = `SELECT amministratore FROM Moderatore WHERE username = $1 LIMIT 1`;
  const result = await pool.query(query, [username]);
  return result.rows.length > 0 && result.rows[0].amministratore === true;
};

const isModeratore = async (username) => {
  const query = `SELECT 1 FROM Moderatore WHERE username = $1 LIMIT 1`;
  const result = await pool.query(query, [username]);
  return result.rows.length > 0;
};


//PRIVILEGIO: ADMIN 
//MODERATORE
const postModeratore = (req, res) => {
// #swagger.tags = ['Moderatore']
// #swagger.summary = 'Promuove un utente a moderatore'
  const requester = req.user;

  isAdmin(requester).then(isAdminUser => {
  if (!isAdminUser) {
    return res.status(401).send({ message: 'Unauthorized: only administrators allowed.' });
  }

    const query = `
      INSERT INTO Moderatore (username, datanomina)
      VALUES ($1, CURRENT_DATE)
      RETURNING *`;
    const qvals = [req.params.username];

    pool.query(query, qvals).then(results => {
      return res.status(201).send(results.rows[0]);
    })
    .catch(err => {
      return res.status(500).send({ message: 'Query error.', detail: err.message });
    })
})
};
const deleteModeratore = (req, res) => {
// #swagger.tags = ['Moderatore']
// #swagger.summary = 'Rimuove un moderatore (solo per amministratori)'
  const requester = req.user;


  isAdmin(requester).then(isAdminUser => {
  if (!isAdminUser) {
    return res.status(401).send({ message: 'Unauthorized: only administrators allowed.' });
  }

    const query = `
      DELETE FROM Moderatore
      WHERE username = $1
      RETURNING *;
    `;
    const qvals = [req.params.username];

    pool.query(query, qvals).then(results => {
      if (results.rows.length === 0)
        return res.status(404).send({ message: 'Moderatore not found.' });

      return res.status(200).send({ message: 'Moderatore deleted.', data: results.rows[0] });
    }).catch(err => {
      return res.status(500).send({ message: 'Query error.', detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization check error.', detail: err.message });
  });
};

//PRIVILEGIO: MODERATORE
//MODERATORE
const getModeratori = (req, res) => {
// #swagger.tags = ['Moderatore']
// #swagger.summary = 'Recupera la lista di tutti i moderatori'
  const requester = req.user;

    isModeratore(requester).then(isMod => {
    if (!isMod) {
      return res.status(401).send({ message: 'Unauthorized.' });
    }

    const params = {}
    params.search = (req.query.q === undefined) ? "" : req.query.q
    params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt(req.query.size)
    params.page = (isNaN(req.query.page) || req.query.page < 1) ? 0 : parseInt(req.query.page)
    params.next = null
    params.previous = params.page > 0 ? params.page-1 : null

    const query = `
      SELECT m.username, u.imgprofilo, m.datanomina, m.amministratore
      FROM moderatore m
      JOIN utente u ON m.username = u.username
      WHERE m.username ILIKE $3
      ORDER BY m.datanomina DESC
      LIMIT $1 OFFSET $2`;
      const qvals = [params.size+1, params.page*params.size, `%${params.search}%`]


    pool.query(query,qvals).then(results => {
      if(results.rows.length > params.size) {
			params.result = results.rows.slice(0,-1)
			params.next = params.page+1
		} else {
			params.result = results.rows
		}
      return res.status(200).send(params);
    }).catch(err => {
      return res.status(500).send({ message: 'Query error.', detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization check error.', detail: err.message });
  });
};
const getUtentiModerati = (req, res) => {
  // #swagger.tags = ['Utente']
  // #swagger.summary = 'Recupera la lista degli utenti moderati dallo user, con i relativi post moderati'

  const requester = req.user;

    isModeratore(requester).then(isMod => {
      if (!isMod) {
        return res.status(401).send({ message: 'Unauthorized.' });
    }

    const params = {};
    params.search = req.query.q ? req.query.q : "";
    params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt(req.query.size);
    params.page = (isNaN(req.query.page) || req.query.page < 1) ? 0 : parseInt(req.query.page);
    params.next = null;
    params.previous = params.page > 0 ? params.page - 1 : null;

    const searchPattern = `%${params.search}%`;
    const qvals = [requester, searchPattern, params.size + 1, params.page * params.size];

    const query = `
      SELECT 
        u.username,
        u.imgProfilo,
        json_agg(p.idPost) AS postModerati
      FROM Modera m
      JOIN Post p ON m.idPost = p.idPost
      JOIN Utente u ON u.username = p.usernameCreatore
      WHERE m.username = $1
        AND LOWER(u.username) LIKE LOWER($2)
      GROUP BY u.username, u.imgProfilo
      ORDER BY u.username
      LIMIT $3 OFFSET $4;
    `;

    pool.query(query, qvals).then(results => {
      if (results.rows.length > params.size) {
        params.result = results.rows.slice(0, -1);
        params.next = params.page + 1;
      } else {
        params.result = results.rows;
      }

      return res.status(200).send(params);
    }).catch(err => {
      return res.status(500).send({ message: 'Query error.', detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization check error.', detail: err.message });
  });
};
//POST
const getFlaggedPosts = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Recupera tutti i post flaggati'
  const requester = req.user;

    isModeratore(requester).then(isMod => {
      if (!isMod) {
        return res.status(401).send({ message: 'Unauthorized.' });
    }

    const params = {};
    params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt(req.query.size);
    params.page = (isNaN(req.query.page) || req.query.page < 1) ? 0 : parseInt(req.query.page);
    params.next = null;
    params.previous = params.page > 0 ? params.page - 1 : null;

    const qvals = [params.size + 1, params.page * params.size];  

    const query = `
      SELECT DISTINCT 
        p.idPost,
        p.usernameCreatore,
        TO_CHAR(p.dataOraPubblicazione, 'YYYY-MM-DD') AS dataPubblicazione,
        TO_CHAR(p.dataOraPubblicazione, 'HH24:MI:SS') AS oraPubblicazione,
        p.tipo, p.testo, p.immagine,
        u.imgProfilo AS imgProfiloCreatore,
        COUNT(f.username) AS flagCount
      FROM Post p
      JOIN Utente u ON u.username = p.usernameCreatore
      JOIN Flaggare f ON f.idPost = p.idPost
      GROUP BY p.idPost, u.imgProfilo, p.tipo, p.testo, p.immagine, p.dataOraPubblicazione
      LIMIT $1 OFFSET $2;
    `;

    pool.query(query, qvals).then(result => {
      if (result.rows.length > params.size) {
        params.result = result.rows.slice(0, -1);
        params.next = params.page + 1;
      } else {
        params.result = result.rows;
      }
      return res.status(200).send(params);
    }).catch(err => {
      return res.status(500).send({ message: 'Query error retrieving flagged posts.', detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization check error.', detail: err.message });
  });
};
const getFlaggedPost = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Recupera le flag di un post specifico'
  const requester = req.user;
  const idPost = parseInt(req.params.idPost);

  if (isNaN(idPost)) {
    return res.status(400).send({ message: "Invalid post ID." });
  }

    isModeratore(requester).then(isMod => {
      if (!isMod) {
        return res.status(401).send({ message: 'Unauthorized.' });
    }

    const query = `
      SELECT 
        p.idPost,
        p.usernameCreatore,
        TO_CHAR(p.dataOraPubblicazione, 'YYYY-MM-DD') AS dataPubblicazione,
        TO_CHAR(p.dataOraPubblicazione, 'HH24:MI:SS') AS oraPubblicazione,
        p.tipo, p.testo, p.immagine,
        u.imgProfilo AS imgProfiloCreatore,
        COUNT(f.username) AS flagCount,
        ARRAY_AGG(f.username) AS utentiFlagganti
      FROM Post p
      JOIN Utente u ON u.username = p.usernameCreatore
      JOIN Flaggare f ON f.idPost = p.idPost
      WHERE p.idPost = $1
      GROUP BY p.idPost, u.imgProfilo, p.tipo, p.testo, p.immagine, p.dataOraPubblicazione
    `;

    pool.query(query, [idPost]).then(result => {
      if (result.rows.length === 0) {
        return res.status(404).send({ message: 'Flagged post not found.' });
      }

      return res.status(200).send(result.rows[0]);
    }).catch(err => {
      return res.status(500).send({ message: 'Query error retrieving flagged post.', detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization check error.', detail: err.message });
  });
};
const getPostModerati = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Recupera i post moderati dal moderatore'
  const requester = req.user;

    isModeratore(requester).then(isMod => {
      if (!isMod) {
        return res.status(401).send({ message: 'Unauthorized.' });
    }

    const params = {};
    params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt(req.query.size);
    params.page = (isNaN(req.query.page) || req.query.page < 1) ? 0 : parseInt(req.query.page);
    params.next = null;
    params.previous = params.page > 0 ? params.page - 1 : null;

    const qvals = [requester, params.size + 1, params.page * params.size];

    const query = `
      SELECT 
        p.idPost,
        p.usernameCreatore,
        TO_CHAR(p.dataOraPubblicazione, 'YYYY-MM-DD') AS dataPubblicazione,
        TO_CHAR(p.dataOraPubblicazione, 'HH24:MI:SS') AS oraPubblicazione,
        p.tipo, p.testo, p.immagine,
        TO_CHAR(m.dataOraModerazione, 'YYYY-MM-DD') AS dataModerazione,
        TO_CHAR(m.dataOraModerazione, 'HH24:MI:SS') AS oraModerazione,
        u.imgProfilo AS imgProfiloCreatore
      FROM Modera m
      JOIN Post p ON p.idPost = m.idPost
      JOIN Utente u ON u.username = p.usernameCreatore
      WHERE m.username = $1
      ORDER BY m.dataOraModerazione DESC
      LIMIT $2 OFFSET $3;
    `;

    pool.query(query, qvals).then(result => {
      if (result.rows.length > params.size) {
        params.result = result.rows.slice(0, -1);
        params.next = params.page + 1;
      } else {
        params.result = result.rows;
      }

      return res.status(200).send(result.rows);
    }).catch(err => {
      return res.status(500).send({ message: 'Query error retrieving moderated posts.', detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization check error.', detail: err.message });
  });
};
//MODERAZIONE
const moderaPost = (req, res) => {  //fatto
  // #swagger.tags = ['Moderazione']
  // #swagger.summary = 'Modera un post specifico'
  const requester = req.user;
  const idPost = parseInt(req.params.idPost);  // ← prende l'idPost dalla rotta

  if (isNaN(idPost)) {
    return res.status(400).send({ message: "Invalid 'idPost' in path." });
  }

    isModeratore(requester).then(isMod => {
      if (!isMod) {
        return res.status(401).send({ message: 'Unauthorized.' });
    }

    const checkPost = `
      SELECT idPost FROM Post WHERE idPost = $1;
    `;

    pool.query(checkPost, [idPost]).then(postResult => {
      if (postResult.rows.length === 0) {
        return res.status(404).send({ message: "Post not found." });
      }

      const insertQuery = `
        INSERT INTO Modera (username, idPost)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *;
      `;

      const qvals = [requester, idPost];

      pool.query(insertQuery, qvals).then(insertResult => {
        if (insertResult.rows.length === 0) {
          return res.status(200).send({ message: "Post already moderated by this user." });
        }
        return res.status(201).send({ message: "Post moderated.", data: insertResult.rows[0] });
      }).catch(err => {
        return res.status(500).send({ message: "Insert error.", detail: err.message });
      });

    }).catch(err => {
      return res.status(500).send({ message: "Post check error.", detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: "Authorization check error.", detail: err.message });
  });
};
const annullaModerazione = (req, res) => {
  // #swagger.tags = ['Moderazione']
  // #swagger.summary = 'Annulla la moderazione di un post'

  const requester = req.user;
  const idPost = parseInt(req.params.idPost);

  if (isNaN(idPost)) {
    return res.status(400).send({ message: "Invalid 'idPost' in request parameters." });
  }

    isModeratore(requester).then(isMod => {
      if (!isMod) {
        return res.status(401).send({ message: 'Unauthorized.' });
    }

      //Cancella la riga da MODERA
      const deleteQuery = `
        DELETE FROM Modera
        WHERE idPost = $1
        RETURNING *;
      `;

      pool.query(deleteQuery, [idPost]).then(deleteResult => {
        if (deleteResult.rows.length === 0) {
          return res.status(404).send({ message: "Moderation already removed or not found." });
        }
        return res.status(200).send({ message: "Moderation removed.", data: deleteResult.rows[0] });
      }).catch(err => {
        return res.status(500).send({ message: "Delete error.", detail: err.message });
      });
  }).catch(err => {
    return res.status(500).send({ message: "Authorization check error.", detail: err.message });
  });
};

//PRIVILEGIO: UTENTE
//POST
const getPosts = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Recupera il feed di tutti i post'
  const params = {};
  params.tipo = req.query.tipo || "%%";
  params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50) ? 10 : parseInt(req.query.size);
  params.page = (isNaN(req.query.page) || req.query.page < 1) ? 0 : parseInt(req.query.page);
  params.offset = params.page * params.size;

  const qvals = [params.tipo, params.size + 1, params.offset];

  const query = `
    SELECT 
      p.idPost,
      p.usernameCreatore,
      TO_CHAR(p.dataOraPubblicazione, 'YYYY-MM-DD') AS dataPubblicazione,
      TO_CHAR(p.dataOraPubblicazione, 'HH24:MI:SS') AS oraPubblicazione,
      p.tipo, p.testo, p.immagine,
      u.imgProfilo AS imgProfiloCreatore,
      COUNT(m.username) AS likes
    FROM Post p
    JOIN Utente u ON u.username = p.usernameCreatore
    LEFT JOIN MiPiace m ON m.idPost = p.idPost
    LEFT JOIN Modera mo ON mo.idPost = p.idPost
    WHERE mo.idPost IS NULL
      AND p.tipo LIKE $1
    GROUP BY p.idPost, u.imgProfilo
    ORDER BY p.dataOraPubblicazione DESC
    LIMIT $2 OFFSET $3;
  `;

  pool.query(query, qvals).then(results => {
    if (results.rows.length > params.size) {
      params.result = results.rows.slice(0, -1);
      params.next = params.page + 1;
    } else {
      params.result = results.rows;
    }

    return res.status(200).send(results.rows);
  }).catch(err => {
    return res.status(500).send({ message: 'Query error.', detail: err.message });
  });
};
const getUserPosts = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Recupera tutti i post di un utente specifico'
  const username = req.params.username;

  const params = {};
  params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50)
    ? 10
    : parseInt(req.query.size);
  params.page = (isNaN(req.query.page) || req.query.page < 1)
    ? 0
    : parseInt(req.query.page);
  params.offset = params.page * params.size;

  const qvals = [username, params.size + 1, params.offset];

  const query = `
    SELECT 
      p.idPost,
      p.usernameCreatore,
      TO_CHAR(p.dataOraPubblicazione, 'YYYY-MM-DD') AS dataPubblicazione,
      TO_CHAR(p.dataOraPubblicazione, 'HH24:MI:SS') AS oraPubblicazione,
      p.tipo, p.testo, p.immagine,
      u.imgProfilo AS imgProfiloCreatore,
      COUNT(m.username) AS likes
    FROM Post p
    JOIN Utente u ON u.username = p.usernameCreatore
    LEFT JOIN MiPiace m ON m.idPost = p.idPost
    LEFT JOIN Modera mo ON mo.idPost = p.idPost
    WHERE p.usernameCreatore = $1
      AND mo.idPost IS NULL
    GROUP BY p.idPost, u.imgProfilo
    ORDER BY p.dataOraPubblicazione DESC
    LIMIT $2 OFFSET $3;
  `;

  pool.query(query, qvals).then(results => {
    const output = {};
    if (results.rows.length > params.size) {
      output.result = results.rows.slice(0, -1); // Rimuovi la riga extra per next page
      output.next = params.page + 1;
    } else {
      output.result = results.rows;
    }
    output.previous = params.page > 0 ? params.page - 1 : null;

    return res.status(200).send(output);
  }).catch(err => {
    return res.status(500).send({ message: 'Query error.', detail: err.message });
  });
};
const getUserPost = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Recupera un post specifico di un utente'
  const username = req.params.username;
  const idPost = parseInt(req.params.idPost);

  if (isNaN(idPost)) {
    return res.status(400).send({ message: "Invalid post ID." });
  }

  const query = `
    SELECT 
      p.idPost,
      p.usernameCreatore,
      TO_CHAR(p.dataOraPubblicazione, 'YYYY-MM-DD') AS dataPubblicazione,
      TO_CHAR(p.dataOraPubblicazione, 'HH24:MI:SS') AS oraPubblicazione,
      p.tipo, p.testo, p.immagine,
      u.imgProfilo AS imgProfiloCreatore,
      COUNT(m.username) AS likes
    FROM Post p
    JOIN Utente u ON u.username = p.usernameCreatore
    LEFT JOIN MiPiace m ON m.idPost = p.idPost
    LEFT JOIN Modera mo ON mo.idPost = p.idPost
    WHERE p.idPost = $1 AND p.usernameCreatore = $2 AND mo.idPost IS NULL
    GROUP BY p.idPost, u.imgProfilo;
  `;

  pool.query(query, [idPost, username]).then(results => {
    if (results.rows.length === 0) {
      return res.status(404).send({ message: "Post not found or has been moderated." });
    }
    return res.status(200).send(results.rows[0]);
  }).catch(err => {
    return res.status(500).send({ message: "Query error.", detail: err.message });
  });
};
const creaPostImmagine = (req, res) => {
  // #swagger.tags = ['Post']
  // #swagger.summary = 'Crea nuovo post di tipo imagine'
  // #swagger.produces = ['image/]
  /* #swagger.requestBody ={
      required: true,
      content: {
      "multipart/form-data": {
      schema: {
          type:"object",
          properties: {
              immagine: {
                  type:"string",
                  format:"binary"
  }}}}}}*/
  const requester = req.user;

  const moderationCheck = `
    SELECT COUNT(*) AS moderati
    FROM Modera mo
    JOIN Post p ON mo.idPost = p.idPost
    WHERE p.usernameCreatore = $1
    AND mo."dataoramoderazione" >= CURRENT_DATE - INTERVAL '30 days';
  `;

  pool.query(moderationCheck, [requester])
    .then(result => {
      const moderati = parseInt(result.rows[0].moderati);

      if (moderati >= 3) {
        return res.status(403).send({
          message: 'Post limit reached: too many moderated posts in the last 30 days.'
        });
      }

      if (!req.files || !req.files.immagine) {
        return res.status(400).send({ message: 'Nessun file inviato' });
      }

      const immagine = req.files.immagine;

      if (!immagine.mimetype.startsWith('image/')) {
        return res.status(400).send({ message: 'Il file non è un\'immagine' });
      }

      const nomeFile = Date.now() + '-' + immagine.name;
      const path = __dirname + '/uploads/img_post/' + nomeFile;
      const url = '/uploads/img_post/' + nomeFile;

      // Salva il file fisicamente
      immagine.mv(path, (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send({ message: 'Errore nel salvataggio immagine' });
        }

        // Inserisci il nuovo post nel DB
        const insertPostQuery = `
          INSERT INTO Post (usernameCreatore, dataOraPubblicazione, tipo, immagine)
          VALUES ($1, NOW(), 'immagine', $2)
          RETURNING *;
        `;
        const values = [requester, url];

        pool.query(insertPostQuery, values)
          .then(result => {
            return res.status(201).send({
              message: 'Post creato con successo.',
              post: result.rows[0]
            });
          })
          .catch(err => {
            console.error(err);
            return res.status(500).send({ message: 'Errore durante l\'inserimento nel database.' });
          });
      });
    })
    .catch(err => {
      console.error(err);
      return res.status(500).send({
        message: 'Errore durante la creazione del post.',
        detail: err.message
      });
    });
};
const creaPostTesto = (req, res) => {
  // #swagger.tags = ['Post']
  // #swagger.summary = 'Crea un nuovo post di tipo testo'
  const requester = req.user;

  const testo = (req.body.testo || '').trim();
  if (!testo) {
    return res.status(400).send({ message: 'Missing or empty "testo".' });
  }

  const moderationCheck = `
    SELECT COUNT(*) AS moderati
    FROM Modera mo
    JOIN Post p ON mo.idPost = p.idPost
    WHERE p.usernameCreatore = $1
    AND mo."dataoramoderazione" >= CURRENT_DATE - INTERVAL '30 days';
  `;

  pool.query(moderationCheck, [requester])
    .then(result => {
      const moderati = parseInt(result.rows[0].moderati);
      if (moderati >= 3) {
        return res.status(403).send({ message: 'Post limit reached: too many moderated posts in the last 30 days.' });
      }

      const query = `
        INSERT INTO Post (testo, tipo, usernameCreatore)
        VALUES ($1, 'testo', $2)
        RETURNING *;
      `;
      return pool.query(query, [testo, requester]);
    })
    .then(insertResult => {
      return res.status(201).send({ message: 'Post created.', data: insertResult.rows[0] });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Errore durante la creazione del post.', detail: err.message });
    });
};
const patchPostTesto = (req, res) => {
  // #swagger.tags = ['Post']
  // #swagger.summary = 'Modifica un post di tipo testo del proprio profilo'

  const requester = req.user;
  const idPost = parseInt(req.params.idPost);
  const nuovoTesto = req.body.testo;

  if (isNaN(idPost)) {
    return res.status(400).send({ message: 'Invalid post ID.' });
  }

  if (typeof nuovoTesto !== 'string' || nuovoTesto.trim().length === 0) {
    return res.status(400).send({ message: 'Invalid "testo" field.' });
  }

  const queryCheck = `
    SELECT tipo
    FROM Post
    WHERE idPost = $1 AND usernameCreatore = $2;
  `;

  pool.query(queryCheck, [idPost, requester]).then(result => {
    if (result.rows.length === 0) {
      return res.status(404).send({ message: 'Post not found or not owned.' });
    }

    if (result.rows[0].tipo !== 'testo') {
      return res.status(400).send({ message: 'Post is not of type testo.' });
    }

    const queryUpdate = `
      UPDATE Post
      SET testo = $1
      WHERE idPost = $2
      RETURNING *;
    `;

    return pool.query(queryUpdate, [nuovoTesto.trim(), idPost])
      .then(updateResult => res.status(200).send(updateResult.rows[0]))
      .catch(err => res.status(500).send({ message: 'Update error.', detail: err.message }));

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization error.', detail: err.message });
  });
};
const patchPostImmagine = (req, res) => {
    // #swagger.tags = ['Post']
  // #swagger.summary = 'Modifica un post di tipo immagine del proprio profilo'
  // #swagger.produces = ['image/']
  /* #swagger.requestBody ={
      required: true,
      content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            immagine: {
              type: "string",
              format: "binary"
            }
          }
        }
      }}
  } */
  const requester = req.user;
  const idPost = parseInt(req.params.idPost);

  if (isNaN(idPost)) {
    return res.status(400).send({ message: 'Invalid post ID.' });
  }

  // 1. Verifica proprietà e tipo
  const queryCheck = `
    SELECT tipo
    FROM Post
    WHERE idPost = $1 AND usernameCreatore = $2;
  `;

  pool.query(queryCheck, [idPost, requester])
    .then(result => {
      if (result.rows.length === 0) {
        return res.status(404).send({ message: 'Post not found or not owned.' });
      }

      if (result.rows[0].tipo !== 'immagine') {
        return res.status(400).send({ message: 'Post is not of type immagine.' });
      }

      // 2. Verifica che il post non sia stato moderato
      const checkModerato = `
        SELECT 1 FROM Modera WHERE idPost = $1;
      `;

      pool.query(checkModerato, [idPost]).then(modResult => {
        if (modResult.rowCount > 0) {
          return res.status(403).send({ message: 'Post moderato. Modifica non consentita.' });
        }

        // 3. Verifica che sia stato inviato un file
        if (!req.files || !req.files.immagine) {
          return res.status(400).send({ message: 'Nessun file inviato' });
        }

        const immagine = req.files.immagine;

        if (!immagine.mimetype.startsWith('image/')) {
          return res.status(400).send({ message: 'Il file non è un\'immagine' });
        }

        const nomeFile = Date.now() + '-' + immagine.name;
        const path = __dirname + '/uploads/img_post/' + nomeFile;
        const url = '/uploads/img_post/' + nomeFile;

        // 4. Salvataggio file e update DB
        immagine.mv(path, (err) => {
          if (err) {
            console.error(err);
            return res.status(500).send({ message: 'Errore nel salvataggio immagine' });
          }

          const queryUpdate = `
            UPDATE Post
            SET immagine = $1
            WHERE idPost = $2
            RETURNING *;
          `;
          const values = [url, idPost];

          pool.query(queryUpdate, values)
            .then(updateResult => res.status(200).send(updateResult.rows[0]))
            .catch(err => res.status(500).send({ message: 'Update error.', detail: err.message }));
        });
      });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Authorization error.', detail: err.message });
    });
};
const deletePost = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Elimina un post specifico'
  const requester = req.user;
  const username = req.params.username;
  const postId = parseInt(req.params.idPost);

  if (isNaN(postId)) {
    return res.status(400).send({ message: 'Invalid post ID.' });
  }

  // L'utente può eliminare solo i suoi post
  if (requester !== username) {
    return res.status(401).send({ message: 'Unauthorized: cannot delete posts of other users.' });
  }

  const checkOwnership = `
    SELECT usernameCreatore
    FROM Post
    WHERE idPost = $1 AND usernameCreatore = $2;
  `;

  pool.query(checkOwnership, [postId, username]).then(result => {
    if (result.rows.length === 0) {
      return res.status(404).send({ message: 'Post not found or not owned by user.' });
    }

    const deleteQuery = `
      DELETE FROM Post
      WHERE idPost = $1
      RETURNING *;
    `;

    pool.query(deleteQuery, [postId]).then(deleteResult => {
      if (deleteResult.rows.length === 0) {
        return res.status(404).send({ message: 'Post already deleted or not found.' });
      }

      return res.status(200).send({
        message: 'Post deleted.',
        data: deleteResult.rows[0]
      });
    }).catch(err => {
      return res.status(500).send({ message: 'Delete error.', detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: 'Ownership check error.', detail: err.message });
  });
};


//SEGUIRE
const seguiUtente = (req, res) => {
// #swagger.tags = ['Follow']
// #swagger.summary = 'Segui un utente specifico'
  const follower = req.user;                // utente autenticato
  const seguito = req.params.username;      // utente da seguire dalla rotta

  if (follower === seguito) {
    return res.status(400).send({ message: "You cannot follow yourself." });
  }

  const checkUtenteQuery = `
    SELECT username
    FROM Utente
    WHERE username = $1
  `;

  pool.query(checkUtenteQuery, [seguito]).then(result => {
    if (result.rows.length === 0) {
      return res.status(404).send({ message: "User to follow not found." });
    }

    const insertQuery = `
      INSERT INTO Seguire (segue, seguito)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *;
    `;

    const qvals = [follower, seguito];

    pool.query(insertQuery, qvals).then(results => {
      if (results.rows.length === 0) {
        return res.status(200).send({ message: "Already following user." });
      } else {
        return res.status(201).send({ message: "Now following user.", data: results.rows[0] });
      }
    }).catch(err => {
      return res.status(500).send({ message: "Insert error.", detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: "User lookup error.", detail: err.message });
  });
};
const smettiDiSeguire = (req, res) => {
// #swagger.tags = ['Follow']
// #swagger.summary = 'Smetti di seguire un utente specifico'
  const follower = req.user;
  const seguito = req.params.username; 

  if (follower === seguito) {
    return res.status(400).send({ message: "You cannot unfollow yourself." });
  }

  const checkUtenteQuery = `
    SELECT username
    FROM Utente
    WHERE username = $1
  `;

  pool.query(checkUtenteQuery, [seguito]).then(result => {
    if (result.rows.length === 0) {
      return res.status(404).send({ message: "User to unfollow not found." });
    }

    const deleteQuery = `
      DELETE FROM Seguire
      WHERE segue = $1 AND seguito = $2
      RETURNING *;
    `;
    const qvals = [follower, seguito];

    pool.query(deleteQuery, qvals).then(results => {
      if (results.rows.length === 0) {
        return res.status(404).send({ message: "Follow relation not found." });
      } else {
        return res.status(200).send({ message: "Unfollowed successfully.", data: results.rows[0] });
      }
    }).catch(err => {
      return res.status(500).send({ message: "Delete error.", detail: err.message });
    });

  }).catch(err => {
    return res.status(500).send({ message: "User lookup error.", detail: err.message });
  });
};

//LIKE
const mettiLike = (req, res) => {
  // #swagger.tags = ['Like']
  // #swagger.summary = 'Aggiunge un like a un post'
  const utente = req.user;
  const idPost = parseInt(req.params.idPost);
  if (isNaN(idPost)) return res.status(400).send({ message: 'Invalid post ID.' });

  const checkPostEsiste = `SELECT 1 FROM Post WHERE idPost = $1`;
  pool.query(checkPostEsiste, [idPost])
    .then(postResult => {
      if (postResult.rowCount === 0) {
        return res.status(404).send({ message: 'Post not found.' });
      }

      const checkModerato = `SELECT 1 FROM Modera WHERE idPost = $1`;
      pool.query(checkModerato, [idPost])
        .then(mod => {
          if (mod.rowCount > 0) {
            return res.status(403).send({ message: 'Post moderato. Operazione non consentita.' });
          }

          const query = `
            INSERT INTO MiPiace (username, idPost)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            RETURNING *;
          `;

          pool.query(query, [utente, idPost])
            .then(result => {
              if (result.rows.length === 0) {
                return res.status(200).send({ message: 'Post already liked.' });
              }
              return res.status(201).send({ message: 'Post liked.', data: result.rows[0] });
            })
            .catch(err => {
              return res.status(500).send({ message: 'Like insert error.', detail: err.message });
            });
        });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Errore controllo post.', detail: err.message });
    });
};

const rimuoviLike = (req, res) => {
  // #swagger.tags = ['Like']
  // #swagger.summary = 'Rimuove un like da un post'
  const utente = req.user;
  const idPost = parseInt(req.params.idPost);
  if (isNaN(idPost)) return res.status(400).send({ message: 'Invalid post ID.' });

  const checkPost = `SELECT 1 FROM Post WHERE idPost = $1`;
  pool.query(checkPost, [idPost]).then(exists => {
    if (exists.rowCount === 0) {
      return res.status(404).send({ message: 'Post non esistente.' });
    }

    const checkModerato = `SELECT 1 FROM Modera WHERE idPost = $1`;
    pool.query(checkModerato, [idPost]).then(mod => {
      if (mod.rowCount > 0) {
        return res.status(403).send({ message: 'Post moderato. Operazione non consentita.' });
      }

      const query = `
        DELETE FROM MiPiace
        WHERE username = $1 AND idPost = $2
        RETURNING *;
      `;

      return pool.query(query, [utente, idPost])
        .then(result => {
          if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Like not found.' });
          }
          return res.status(200).send({ message: 'Like removed.', data: result.rows[0] });
        });
    });
  }).catch(err => {
    return res.status(500).send({ message: 'Errore rimozione like.', detail: err.message });
  });
};
//FLAG
const flaggaPost = (req, res) => {
  // #swagger.tags = ['Flag']
  // #swagger.summary = 'Aggiunge un flag a un post'
  const utente = req.user;
  const idPost = parseInt(req.params.idPost);
  if (isNaN(idPost)) return res.status(400).send({ message: 'Invalid post ID.' });

  const checkPost = `SELECT 1 FROM Post WHERE idPost = $1`;
  pool.query(checkPost, [idPost]).then(exists => {
    if (exists.rowCount === 0) {
      return res.status(404).send({ message: 'Post non esistente.' });
    }

    const checkModerato = `SELECT 1 FROM Modera WHERE idPost = $1`;
    pool.query(checkModerato, [idPost]).then(mod => {
      if (mod.rowCount > 0) {
        return res.status(403).send({ message: 'Post moderato. Operazione non consentita.' });
      }

      const query = `
        INSERT INTO Flaggare (username, idPost)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *;
      `;

      return pool.query(query, [utente, idPost])
        .then(result => {
          if (result.rows.length === 0) {
            return res.status(200).send({ message: 'Post already flagged.' });
          }
          return res.status(201).send({ message: 'Post flagged.', data: result.rows[0] });
        });
    });
  }).catch(err => {
    return res.status(500).send({ message: 'Errore flag.', detail: err.message });
  });
};

const rimuoviFlag = (req, res) => {
  // #swagger.tags = ['Flag']
  // #swagger.summary = 'Rimuove un flag da un post'
  const utente = req.user;
  const idPost = parseInt(req.params.idPost);
  if (isNaN(idPost)) return res.status(400).send({ message: 'Invalid post ID.' });

  const checkPost = `SELECT 1 FROM Post WHERE idPost = $1`;
  pool.query(checkPost, [idPost]).then(exists => {
    if (exists.rowCount === 0) {
      return res.status(404).send({ message: 'Post non esistente.' });
    }

    const checkModerato = `SELECT 1 FROM Modera WHERE idPost = $1`;
    pool.query(checkModerato, [idPost]).then(mod => {
      if (mod.rowCount > 0) {
        return res.status(403).send({ message: 'Post moderato. Operazione non consentita.' });
      }

      const query = `
        DELETE FROM Flaggare
        WHERE username = $1 AND idPost = $2
        RETURNING *;
      `;

      return pool.query(query, [utente, idPost])
        .then(result => {
          if (result.rows.length === 0) {
            return res.status(404).send({ message: 'Flag not found.' });
          }
          return res.status(200).send({ message: 'Flag removed.', data: result.rows[0] });
        });
    });
  }).catch(err => {
    return res.status(500).send({ message: 'Errore rimozione flag.', detail: err.message });
  });
};

//UTENTE
const getUtenti = (req, res) => { 
// #swagger.tags = ['Utente']
// #swagger.summary = 'Recupera tutti gli utenti non moderati'
  const params = {} 
  params.search = (req.query.q === undefined) ? "": req.query.q
  params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50) ? 20 :  parseInt(req.query.size)
  params.page = (isNaN(req.query.page) || req.query.page < 1) ? 0 : parseInt(req.query.page) 
  params.next = null 
  params.previous = params.page > 0 ? params.page-1 : null
  
  const query = `
  SELECT USERNAME, IMGPROFILO
  FROM UTENTE
  WHERE LOWER(USERNAME) LIKE LOWER($1)
  GROUP BY USERNAME
  LIMIT $2 OFFSET $3;`
    //LOWER() rende il confronto case-insensitive (non fa differenza tra maiuscole/minuscole
    //LIMIT mi restituisce il maggior numero di elementi possibile, specificatamente mi restisuisce la il numero di elementi nella pagina + 1
    //...quindi se nn riesce a fare il +1, allora sono all'ultima pagina 

  const searchPattern = `%${params.search}%`; // costruisci il pattern prima
  const qvals = [searchPattern, params.size + 1, params.page * params.size];

  pool.query(query, qvals).then(
    (results) =>{
    if (results.rows.length > params.size){
      params.result = results.rows.slice(0,-1); 
      //memorizza il risultato riga per riga da 0 fino al penultimo elemento, 
      //...pk l'ulitimo è della pagina seguente
      params.next = params.page+1 //non ho bisogno di gestire il caso in cui deve essere null all'ultima pagina, pk è il valore di default del parametro
    } else{
      params.result = results.rows; 
    }
      return res.status(200).send(params.result) //rows è un array di oggetti, ogni oggetto è una riga del risultato 
    }
  ).catch((err) => { //gestisco errore query
    return res.status(500).send({ message: 'Query error', detail: err.message});
  });
}
const getUtente = (req, res) => {
  // #swagger.tags = ['Utente']
  // #swagger.summary = 'Profilo utente con elenco dei suoi post non moderati'

  const query = `
    SELECT 
      u.username,
      u.imgProfilo,
      json_agg(p.idPost) AS postIds
    FROM Utente u
    LEFT JOIN Post p 
      ON p.usernameCreatore = u.username
    LEFT JOIN Modera m 
      ON m.idPost = p.idPost
    WHERE u.username = $1
      AND m.idPost IS NULL
    GROUP BY u.username, u.imgProfilo;
  `;
  const qvals = [req.params.username];

  pool.query(query, qvals)
    .then(results => {
      if (results.rows.length === 1) {
        return res.status(200).send(results.rows[0]);
      } else {
        return res.status(404).send({ message: "User not found." });
      }
    })
    .catch(err => {
      return res.status(500).send({ message: 'Query error', detail: err.message });
    });
};
const patchUtente = (req, res) => {
  // #swagger.tags = ['Utente']
  // #swagger.summary = 'Modifica la mail, la password o lo username dell'utente (non immagine)'
  /* #swagger.requestBody = {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              example: "nuovoUsername"
            },
            mail: {
              type: "string",
              format: "email",
              example: "nuovaemail@example.com"
            },
            password: {
              type: "string",
              format: "password",
              example: "nuovapassword123"
            }
          }
        }
      }
    }
  } */

  const currentUsername = req.user;

  const username = req.body.username?.trim() || null;
  const mail = req.body.mail?.trim() || null;
  const password = req.body.password?.trim() || null;

  if (mail && !mail.includes('@')) {
    return res.status(400).send({ message: 'Mail non valida.' });
  }

  const query = `
    UPDATE Utente
    SET
      username = COALESCE($1, username),
      mail = COALESCE($2, mail),
      password = COALESCE($3, password)
    WHERE username = $4
    RETURNING username, mail, imgProfilo;
  `;
  const values = [username, mail, password, currentUsername];

  pool.query(query, values)
    .then(result => {
      if (result.rows.length === 0) {
        return res.status(404).send({ message: 'Utente non trovato.' });
      }

      return res.status(200).send({ message: 'Utente aggiornato.', data: result.rows[0] });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Errore query.', detail: err.message });
    });
};
const deleteUtente = (req, res) => {
  // #swagger.tags = ['Utente']
  // #swagger.summary = 'Elimina il proprio account utente'

  const username = req.user;

  const deleteQuery = `
    DELETE FROM Utente
    WHERE username = $1
    RETURNING *;
  `;

  pool.query(deleteQuery, [username])
    .then(results => {
      if (results.rows.length === 0)
        return res.status(404).send({ message: 'User not found.' });
      else
        return res.status(200).send({ message: 'User deleted.', data: results.rows[0] });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Query error.', detail: err.message });
    });
};
const getSeguiti = (req, res) => {
// #swagger.tags = ['Utente']
// #swagger.summary = 'Recupera la lista dei seguiti dell'utente
  const targetUser = req.params.username;

  const query = `
    SELECT seguito AS username
    FROM Seguire
    WHERE segue = $1;
  `;

  pool.query(query, [targetUser])
    .then(result => {
      const utenti = result.rows.map(r => r.username);
      return res.send({ tipo: 'seguiti', utenti });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Query error.', detail: err.message });
    });
};
const getSeguaci = (req, res) => {
// #swagger.tags = ['Utente']
// #swagger.summary = 'Recupera la lista dei follower dell' utente
  const targetUser = req.params.username;

  const query = `
    SELECT segue AS username
    FROM Seguire
    WHERE seguito = $1;
  `;

  pool.query(query, [targetUser])
    .then(result => {
      const utenti = result.rows.map(r => r.username);
      return res.send({ tipo: 'follower', utenti });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Query error.', detail: err.message });
    });
};
const cambiaImgProfilo = (req, res) => {
    // #swagger.tags = ['immagineProfilo']
    // #swagger.summary = 'Cambia immagine profilo di un utente autenticato'
    // #swagger.produces = ['image/]
    /* #swagger.requestBody ={
        required: true,
        content: {
        "multipart/form-data": {
        schema: {
            type:"object",
            properties: {
                immagine: {
                    type:"string",
                    format:"binary"
    }}}}}}*/
    if (!req.files || !req.files.immagine) return res.status(400).send({ message: 'Nessun file inviato' })   

    const immagine = req.files.immagine

    // Verifica se è un'immagine
    if (!immagine.mimetype.startsWith('image/')) return res.status(400).send({ message: 'Il file non è un\'immagine' })

    // Prepara nome e percorso
    const nomeFile = Date.now() + '-' + immagine.name
    //dirname contiene nome percorso completo, aggiorni il path per caricare img in uploads
    const path = __dirname + '/uploads/img_profilo/' + nomeFile
    const url = '/uploads/img_profilo/' + nomeFile
    const values = [url,req.user]

    // Sposta il file nella cartella uploads
    immagine.mv(path, (err) => {
        if (err) {
            console.error(err)
            return res.status(500).send({ message: 'Errore nel salvataggio immagine' })
        }

        // Aggiorna immagine nel DB
        const query = `UPDATE Utente SET imgProfilo = $1 WHERE username = $2`
        pool.query(query,values).then(() => {
            return res.status(200).sendFile(path)
        }).catch((err) => {
            console.error(err)
            return res.status(500).send({ message: 'Errore nel database' })
        })
    })
}

//SELEZIONA PARTECIPANTE
//NEW ENPOINTS
const patchPostCheckin = (req, res) => {
 // #swagger.tags = ['Post']
  // #swagger.summary = 'Modifica un post di tipo checkin del proprio profilo'
    /* #swagger.requestBody ={
      required: true,
      content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            nluogo: {
              type: "string",
            },
            nlongitudine: {
              type: "number",
            },
            nlatitudine: {
              type: "number",
            }}}}}} */
  const requester = req.user;
  const idPost = parseInt(req.params.idPost);

  //SE USO CONST NON POSSO MODIFICARE IL VALORE SUCCESSIVAMENTE IN CASO DI INSERIMENTO PARZIALE
  let nluogo = req.body.nluogo;
  let nlongitudine = req.body.nlongitudine;
  let nlatitudine = req.body.nlatitudine;


  if (isNaN(idPost)) {
    return res.status(400).send({ message: 'Invalid post ID.' });
  }

  //check se il tipo è corretto e se l'update è parziale uso existing
  const queryCheck = `
    SELECT tipo, luogo, longitudine, latitudine
    FROM Post
    WHERE idPost = $1 AND usernameCreatore = $2;
  `;

  pool.query(queryCheck, [idPost, requester]).then(result => {
    if (result.rows.length === 0) {
      return res.status(404).send({ message: 'Post not found or not owned.' });
    }

    if (result.rows[0].tipo !== 'checkin') { //si riferisce alla prima riga (in posizione 0) della vista creata, e specificatametne all'attributi 'tipo' 
      return res.status(400).send({ message: 'Post is not of type checkin.' });
    }

    const existing = result.rows //prende tutta la ennupla
    if (typeof nluogo !== 'string'|| nluogo.trim()==='') { 
      nluogo = existing.luogo
    }
    if (isNaN(nlongitudine)) {
      nlongitudine = existing.longitudine
    }
    if (isNaN(nlatitudine)) {
      nlatitudine = existing.latitudine
    }
    const queryUpdate = `
      UPDATE Post
      SET luogo = $1, longitudine = $2, latitudine = $3
      WHERE idPost = $4
      RETURNING *;
    `;

    return pool.query(queryUpdate, [nluogo, nlongitudine, nlatitudine, idPost])
      .then(updateResult => res.status(200).send(updateResult.rows[0]))
      .catch(err => res.status(500).send({ message: 'Update error.', detail: err.message }));

  }).catch(err => {
    return res.status(500).send({ message: 'Authorization error.', detail: err.message });
  });
};
const creaPostCheckin = (req, res) => {
   // #swagger.tags = ['Post']
  // #swagger.summary = 'Modifica un post di tipo checkin del proprio profilo'
  /* #swagger.requestBody ={
      required: true,
      content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            luogo: {
              type: "string",
            },
            longitudine: {
              type: "number",
            },
            latitudine: {
              type: "number",
    }}}}}} */

  const requester = req.user;

  const luogo = (req.body.luogo || '').trim();
  const longitudine = req.body.longitudine;
  const latitudine = req.body.latitudine;

  if (typeof luogo !== 'string' || luogo.trim() === '') {
    return res.status(400).send({ message: 'luogo nn specificato' });
  }
  if (isNaN(longitudine)){
    return res.status(400).send({ message: 'longitudine nn specificata' });
  }
  if (isNaN(latitudine)){
    return res.status(400).send({ message: 'latitudine nn specificata' });
  }


  const moderationCheck = `
    SELECT COUNT(*) AS moderati
    FROM Modera mo
    JOIN Post p ON mo.idPost = p.idPost
    WHERE p.usernameCreatore = $1
    AND mo."dataoramoderazione" >= CURRENT_DATE - INTERVAL '30 days';
  `;

  pool.query(moderationCheck, [requester])
    .then(result => {
      
      const moderati = parseInt(result.rows[0].moderati);
      if (moderati >= 3) {
        return res.status(403).send({ message: 'Post limit reached: too many moderated posts in the last 30 days.' });
      }

      const query = `
        INSERT INTO Post (tipo, usernameComm, longitudine, latitudine, luogo)
        VALUES ('checkin', $1, $2, $3, $4)
        RETURNING *;
      `;
      return pool.query(query, [ requester, longitudine, latitudine, luogo]);
    })
    .then(insertResult => {
      return res.status(201).send({ message: 'Post created.', data: insertResult.rows[0] });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Errore durante la creazione del post.', detail: err.message });
    });
};


const selezionaPartecipante = (req, res) => {
  // #swagger.tags = ['Post']
  // #swagger.summary = 'Seleziona un post come partecipante alla boujee vibe challenge'

  const idPost = parseInt(req.params.idPost);
  const requester  = req.user;

  //idPost esistente
  if (isNaN(idPost)) {
    return res.status(400).send({ message: "Invalid post ID." });
  }
  //amministratore
  isAdmin(requester).then(isAdminUser => {
  if (!isAdminUser) {
    return res.status(401).send({ message: 'Unauthorized: only administrators allowed.' });
  }})


  //idPost non moderato?
  const moderationCheck = `
    SELECT COUNT(*) AS moderati
    FROM Modera mo
    JOIN Post p ON mo.idPost = p.idPost
    WHERE p.usernameCreatore = $1
    AND mo."dataoramoderazione" >= CURRENT_DATE - INTERVAL '30 days';
  `;

  pool.query(moderationCheck, [requester])
    .then(result => {
      const moderati = parseInt(result.rows[0].moderati);
      if (moderati >= 3) {
        return res.status(403).send({ message: 'Post limit reached: too many moderated posts in the last 30 days.' });
      }

      const query = `
        INSERT INTO Commenti (testo, usernameCommentatore, idPost)
        VALUES ('selezionato per la boujee vibe challenge', $1, $2)
        RETURNING *
      `;
      return pool.query(query, [requester, idPost]);
    })
    .then(insertResult => {
      return res.status(201).send({ message: 'Post selezionato.', data: insertResult.rows[0] });
    })
    .catch(err => {
      return res.status(500).send({ message: 'Errore durante la selezione del post.', detail: err.message });
    });
};
const deselezionaPartecipante = (req, res) => {
  // #swagger.tags = ['Post']
  // #swagger.summary = 'Rimuove un partecipante dalla competizione'
  const utente = req.user;
  const idPost = parseInt(req.params.idPost);
  if (isNaN(idPost)) return res.status(400).send({ message: 'Invalid post ID.' });

  const checkPost = `SELECT 1 FROM Post WHERE idPost = $1`;
  pool.query(checkPost, [idPost]).then(exists => {
    if (exists.rowCount === 0) {
      return res.status(404).send({ message: 'Post non esistente.' });
    }

    const checkModerato = `SELECT 1 FROM Modera WHERE idPost = $1`;
    pool.query(checkModerato, [idPost]).then(mod => {
      if (mod.rowCount > 0) {
        return res.status(403).send({ message: 'Post moderato. Operazione non consentita.' });
      }

      const query = `
        DELETE FROM commenti
        WHERE idPost = $1
        RETURNING *;
      `;

      return pool.query(query, [idPost])
        .then(result => {
          if (result.rows.length === 0) {
            return res.status(404).send({ message: 'participant not found.' });
          }
          return res.status(200).send({ message: 'participant removed.', data: result.rows[0] });
        });
    });
  }).catch(err => {
    return res.status(500).send({ message: 'Errore rimozione partecipante.', detail: err.message });
  });
};
const aggiungiCommento = (req, res) => {
  // #swagger.tags = ['Post']
  // #swagger.summary = 'Aggiunge un commento ad uno specifico post'

  const idPost = parseInt(req.params.idPost);
  const requester  = req.user;

  //commento valido
  const testo = (req.body.testo || '').trim();
  if (typeof testo !== 'string' || testo.trim().length === 0) {
    return res.status(400).send({ message: 'Invalid "testo" field.' });
  }

  //idPost esistente
  if (isNaN(idPost)) {
    return res.status(400).send({ message: "Invalid post ID." });
  }


  //idPost non in competizione?
  const checkSeInCompetizione = `
    SELECT p.usernamecreatore
    FROM commenti c JOIN post p on c.idpost = p.idpost
    WHERE c.idpost = $1
  `;

  pool.query(checkSeInCompetizione, [idPost])
    .then(result => {
      if (result.rows.length === 0) {
        return res.status(403).send({ message: 'Post non in competizione' });
      }
      if (requester == result.rows[0].usernamecreatore)
        return res.status(401).send({ message: 'Unauthorized' });
      const query = `
        INSERT INTO Commenti (testo, usernameCommentatore, idPost)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      return pool.query(query, [testo, requester, idPost]);
    })
    .then(insertResult => {
      return res.status(201).send(insertResult.rows);
    })
    .catch(err => {
      return res.status(500).send({ message: 'Errore durante la selezione del post.', detail: err.message });
    });
};
const leggiCommento = (req, res) => {
// #swagger.tags = ['Post']
// #swagger.summary = 'Leggi commenti post'
  const idPost = parseInt(req.params.idPost);

  if (isNaN(idPost)) {
    return res.status(400).send({ message: "Invalid post ID." });
  }

  const query = `
    SELECT * 
    FROM commenti     
    WHERE idPost = $1
  `;

  pool.query(query, [idPost]).then(results => {
    if (results.rows.length === 0) {
      return res.status(404).send({ message: "Post senza commenti" });
    }
    return res.status(200).send(results.rows);
  }).catch(err => {
    return res.status(500).send({ message: "Query error.", detail: err.message });
  });
};
const classifica = (req, res) => {
// #swagger.tags = ['Classifica']
// #swagger.summary = 'mostra la classifica della boujee vibe challenge'
  const tipo = req.params.tipo;
  const params = {};
  params.size = (isNaN(req.query.size) || req.query.size < 1 || req.query.size > 50) ? 10 : parseInt(req.query.size);
  params.page = (isNaN(req.query.page) || req.query.page < 1) ? 0 : parseInt(req.query.page);
  params.offset = params.page * params.size;

  const qvals = [tipo, params.size + 1, params.offset];

  const query = `
    SELECT COUNT(c.idpost), c.idpost, p.usernamecreatore
    FROM commenti c JOIN post p ON c.idpost = p.idpost 
    WHERE p.tipo = $1
    GROUP BY(c.idpost, p.usernamecreatore)
    ORDER BY COUNT(c.idpost) DESC
    LIMIT $2 OFFSET $3;
  `;

  pool.query(query, qvals).then(results => {
    if (results.rows.length > params.size) {
      params.result = results.rows.slice(0, -1);
      params.next = params.page + 1;
    } else {
      params.result = results.rows;
    }

    return res.status(200).send(results.rows);
  }).catch(err => {
    return res.status(500).send({ message: 'Query error.', detail: err.message });
  });
};



