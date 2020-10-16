import React, {Component, Fragment} from 'react';
import {Tweet} from 'react-twitter-widgets';

export class TwitterTweet extends Component {

    constructor(props) {
        super(props);
        this.state = {
            twitterFeeds: [],
            twitterId: []
        }
    }

    getIdList = () => {
        let domainName;
        let idList = [];
        if (this.props.postUrls) {
            this.props.postUrls.map((url_date, index) => {
                let url = url_date.split(',', 2)[0];
                domainName = url.split('//', 2)[1].split('/', 20)[0];
                if (domainName === "twitter.com") {
                    idList.push(url.split('/', 6)[5]);
                }
            });
            return idList;
        }
    };

    render() {
        let title;
        if (this.props.word) {
            title = <h4>Tweet(s) related to <b>{this.props.word}</b></h4>;
        }
        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        {title}
                    </div>
                </div>
                <div className="row" style={{height: '438px', overflow: 'auto'}}>
                    {this.getIdList().map((id, index) => (
                        <div style={{marginLeft: '10px'}}>
                            <Tweet
                                key={index}
                                tweetId={id}
                                options={{
                                    cards: 'hidden',
                                    conversation: 'none',
                                    width: '100%',
                                }}
                            />
                        </div>
                    ))}
                </div>
            </Fragment>
        )
    }
}

export default (TwitterTweet);