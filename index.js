const DTF = require('@eartharoid/dtf');
const dtf = new DTF();
const {
	MessageAttachment,
	MessageEmbed
} = require('discord.js');

module.exports = Plugin => class DemoPlugin extends Plugin {
	constructor(client, id) {
		super(client, id, {
			commands: [],
			name: 'Tiket Transkript'
		});
	}

	preload() {
		this.config = this.client.config[this.id];

		this.client.tickets.on('close', async id => {
			const ticket = await this.client.db.models.Ticket.findOne({ where: { id } });
			if (!ticket) return;

			const category = await this.client.db.models.Category.findOne({ where: { id: ticket.category } });
			if (!category) return;

			const guild = await this.client.db.models.Guild.findOne({ where: { id: category.guild } });
			if (!guild) return;

			const creator = await this.client.db.models.UserEntity.findOne({
				where: {
					ticket: id,
					user: ticket.creator
				}
			});
			if (!creator) return this.client.log.warn(`Nemogu napraviti transkript za tiket  #${ticket.number} zbog toga sto kreator nedostaje! Izasao sa servera?`);

			const lines = [];
			lines.push(`Tiket ${ticket.number}, kreiran od strane ${this.client.cryptr.decrypt(creator.username)}#${creator.discriminator}, ${ticket.createdAt}\n`);

			let closer;

			if (ticket.closed_by) {
				closer = await this.client.db.models.UserEntity.findOne({
					where: {
						ticket: id,
						user: ticket.closed_by
					}
				});
			}

			if (closer) lines.push(`Zatvoren od strane ${this.client.cryptr.decrypt(closer.username)}#${closer.discriminator}, ${ticket.updatedAt}\n`);

			const messages = await this.client.db.models.Message.findAll({ where: { ticket: id } });

			for (const message of messages) {
				const user = await this.client.db.models.UserEntity.findOne({
					where: {
						ticket: id,
						user: message.author
					}
				});

				if (!user) continue;

				const timestamp = dtf.fill('YYYY-MM-DD HH:mm:ss', new Date(ticket.createdAt), true);
				const username = this.client.cryptr.decrypt(user.username);
				const display_name = this.client.cryptr.decrypt(user.display_name);
				const data = JSON.parse(this.client.cryptr.decrypt(message.data));
				let content = data.content ? data.content.replace(/\n/g, '\n\t') : '';
				data.attachments?.forEach(a => {
					content += '\n\t' + a.url;
				});
				data.embeds?.forEach(() => {
					content += '\n\t[Nazalost podatci napisani u embedu nemogu biti izlogovani kao string!!! Zanemarite ovu poruku]';
				});
				lines.push(`[${timestamp}] ${display_name} (${username}#${user.discriminator}) :> ${content}\n`);
			}


			const channel_name = category.name_format
				.replace(/{+\s?(user)?name\s?}+/gi, this.client.cryptr.decrypt(creator.display_name))
				.replace(/{+\s?num(ber)?\s?}+/gi, ticket.number);

			const attachment = new MessageAttachment(Buffer.from(lines.join('\n')), channel_name + '.txt');

			if (this.config.channels[guild.id]) {
				try {
					const g = await this.client.guilds.fetch(guild.id);
					const embed = new MessageEmbed()
						.setColor(guild.colour)
						.setTitle(`#${channel_name} zatvoren`)
						.addField('Kreator', `<@${ticket.creator}>`)
						.setTimestamp()
						.setFooter(guild.footer, g.iconURL());

					if (closer) embed.addField('Zatvoren od strane', `<@${ticket.closed_by}>`);
					if (ticket.topic) embed.addField('Tema', `\`${this.client.cryptr.decrypt(ticket.topic)}\``);
					if (ticket.closed_reason) embed.addField('Razlog zatvaranja', `\`${this.client.cryptr.decrypt(ticket.closed_reason)}\``);

					const log_channel = await this.client.channels.fetch(this.config.channels[guild.id]);
					await log_channel.send({
						embeds: [embed],
						files: [attachment]
					});
				} catch (error) {
					this.client.log.warn('Nisam u spio poslati transkript u log kanal');
					this.client.log.error(error);
				}
			}

			try {
				const user = await this.client.users.fetch(ticket.creator);
				user.send({ files: [attachment] });
			} catch (error) {
				this.client.log.warn('Nisam uspio poslati transcript tiket creatoru');
				this.client.log.error(error);
			}

		});
	}

	load() {}
};
