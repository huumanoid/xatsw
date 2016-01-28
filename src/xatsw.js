'use strict'

const path = require('path');
const fs = require('fs');

var program = require('commander');
const prompt = require('prompt');


function readConf() {
    var config;
    try {
        config = fs.readFileSync('xatsw.conf', 'utf8');
        config = JSON.parse(config);
    } catch (e) {
        console.log('error while config reading:', e);
        config = {};
    }
    config.targets = config.targets || {};
    return config;
}

function saveConf(config) {
    fs.writeFileSync('xatsw.conf', JSON.stringify(config));
}


var config = readConf();

process.on('exit', function () { 
    saveConf(config) 
});

function askName(path) {
    return new Promise(function (resolve, reject) {
        prompt.start();
        prompt.get([
            {
                name: 'storeName',
                type: 'string',
                description: 'set the name of loading profile',
                pattern: `.[^${path.sep}]`,
                messages: {
                    pattern: 'Please, enter valid filename',
                    conform: 'File shouldn\'t exist.'
                },
                conform: function (value) {
                    try {
                        fs.accessSync(path.join(path, value));
                        return false;
                    } catch (e) {
                        return true;
                    }
                }
            }
        ], function (err, res) {
            if (err) {
                return reject(err);
            }
            resolve(res.storeName);
        });
    });
}



class ProfileWorker {

    constructor(options) {
        this.options = options;
    }

    processArgs() {
        const storeName = this.options.name,
            storage = this.options.storage || config.storage,
            target = this.options.target 
                || config.targets[config.current_target];



        return new Promise(function (resolve, reject) {
            if (!target) {
                console.error('Target is not specified. Use -t, --target ' +
                        'or execute set-target to specify default target');
                reject();
            }
            if (storeName) {
                resolve(storeName);
            }
            reject({askName: true})
        }).catch(function (e) {
            e = e || {}
            if (e.askName) {
                return askName(storage);
            }
            return Promise.reject();
        }).then(function (storeName) {
            return Promise.resolve({ 
                inStorage: path.join(storage, storeName),
                inTarget: path.join(target, 'chat.sol')
            });
        });

    }

    load() {
        this.processArgs()
            .then(function (names) {
                try {
                    fs.lstatSync(names.nameInStorage);
                    return new Promise(function (resolve, reject) {
                        prompt.start();
                        prompt.get([{
                            name: 'confirm',
                            description: 'File ' + names.nameInStorage +
                                'already exists. Rewrite? y/n',
                            pattern: '^[y|n]$',
                            message: 'Please, type y or n',
                            required: true
                        }], function (err, res) {
                            if (err || res.confirm == 'n') {
                                reject()
                            }
                            resolve(names);
                        });
                    });

                    
                } catch (e) { }
                return names;

            }).then(function (names) {
                const wstream = fs.createWriteStream(names.inStorage);
                fs.createReadStream(names.inTarget).pipe(wstream);
            })
    }

    extract() {
        this.processArgs()
            .then(function (names) {
                const wstream = fs.createWriteStream(names.inTarget);
                fs.createReadStream(names.inStorage).pipe(wstream);
            })
            
    }
}

program
    .version('0.1.0');

program
    .command('extract [name]')
    .description('Extracting existing profile to flash local storage')
    .option('-s, --storage [storage]', 'Where to store')
    .option('-t, --target [target]', 'From whence to store')
    .action(function (name, options) {
        options.name = name;
        new ProfileWorker(options).extract();
    });


program
    .command('load [name]')
    .description('Loading profile from flash local storage')
    .option('-s, --storage [storage]', 'Where to store')
    .option('-t, --target [target]', 'From whence to store')
    .action(function (name, options) {
        options.name = name;
        new ProfileWorker(options).load();
    });


program
    .command('list-target')
    .description('Shows full list of targets')
    .action(function () {
        for (var key in config.targets) {
            console.log('%s %s', key, config.targets[key]);
        }
    });


program
    .command('set-target [name]')
    .description('Set current target, used by default')
    .action(function (name) {
        if (config.targets[name]) {
            config.current_target = name;
        } else {
            console.error('Target with name %s doesn\'t exists', name);
        }
    })

program
    .command('add-target [name] [path]')
    .description('Adding new target to target list')
    .action(function (name, target_path) {
        try {
            if (fs.lstatSync(path).isDirectory()) {
                new Promise(function (resolve, reject) {
                    if (config.targets[name]) {
                        prompt.start();
                        return prompt.get([{
                            name: 'confirm',
                            pattern: /^[y|n]$/,
                            description: 'Target with name ' + name +
                                ' is already exists. Rewrite? y/n',
                            message: 'Please, type y or n',
                            required: true
                        }], function (err, res) {
                            if (err || res.confirm === 'n') {
                                reject();
                            }
                            resolve();
                        });
                    }
                    resolve();
                }).then(function () {
                    target_path = path.resolve(target_path);
                    config.targets[name] = target_path;
                    console.log('%s added to target list', target_path);
                });
            } else {
                console.error('File %s is not a directory', target_path);
            }
        } catch (e) {
            console.error('File %s doesn\'t exists', target_path);
        }
    });

program
    .command('remove-target [name]')
    .description('Remove target from target list')
    .action(function (name) {
        delete config.targets[name];
     });

program
    .command('set-storage')
    .description('Sets current storage, used by default')
    .action(function (storage_path) {
        try {
            storage_path = path.resolve(storage_path);
            if (fs.lstatSync(storage_path).isDirectory()) {
                config.storage = storage_path;
                console.log('%s set as storage', storage_path);
            } else {
                console.error('File %s is not a directory', path);
            }
        } catch (e) {
            console.error('File %s doesn\'t exists', path);
        }
    });

program.parse(process.argv);

